import { IAIService, AIResponse } from '../ports/IAIService.js';
import { IWhatsAppService } from '../ports/IWhatsAppService.js';
import { IConversationRepository } from '../../domain/repositories/IConversationRepository.js';
import { ContextOptimizerService } from '../services/ContextOptimizerService.js';
import { CoexistenceService } from '../services/CoexistenceService.js';
import { IntentRouterService } from '../services/IntentRouterService.js';
import { GuardrailsService } from '../services/GuardrailsService.js';
import { ObservabilityService } from '../services/ObservabilityService.js';
import { ENV } from '../../infrastructure/config/env.js';
import { IOrderRepository } from '../../domain/repositories/IOrderRepository.js';

export interface IncomingMessagePayload {
  from: string; // Teléfono, JID o LID del cliente
  text?: string;
  imageUrl?: string;
  isCallEvent?: boolean; // Indicador de evento de llamada de voz detectado
}

export interface ProcessMessageResult {
  replied: boolean;
  replyMessage: string;
  isCallRejection: boolean;
  aiResponse?: AIResponse;
  silencedReason?: string;
}

export class ProcessIncomingMessageUseCase {
  private readonly contextOptimizer: ContextOptimizerService;
  private readonly coexistenceService?: CoexistenceService;
  private readonly intentRouter?: IntentRouterService;
  private readonly guardrailsService: GuardrailsService;
  private readonly observability: ObservabilityService;

  constructor(
    private readonly aiService: IAIService,
    private readonly whatsAppService: IWhatsAppService,
    private readonly conversationRepo: IConversationRepository,
    contextOptimizer?: ContextOptimizerService,
    coexistenceService?: CoexistenceService,
    intentRouter?: IntentRouterService,
    guardrailsService?: GuardrailsService,
    observability?: ObservabilityService,
    private readonly orderRepository?: IOrderRepository
  ) {
    this.contextOptimizer = contextOptimizer || new ContextOptimizerService();
    this.coexistenceService = coexistenceService;
    this.intentRouter = intentRouter || new IntentRouterService();
    this.guardrailsService = guardrailsService || new GuardrailsService();
    this.observability = observability || new ObservabilityService();
  }

  public async execute(payload: IncomingMessagePayload): Promise<ProcessMessageResult> {
    // Conservamos el destino original para el proveedor (incluido +, JID o
    // LID). La normalización de la clave interna se hace en los repositorios y
    // en CoexistenceService.
    const phoneNumber = payload.from.trim();
    const userText = payload.text || '';
    const imageUrl = payload.imageUrl;
    this.observability.increment('messagesProcessed');

    // 1. REGLA DE COEXISTENCIA: Verificar si el bot tiene permiso para responder
    if (this.coexistenceService) {
      const decision = await this.coexistenceService.evaluateAccess(phoneNumber, userText);
      if (!decision.canRespond) {
        if (!decision.isCommandHandled) {
          await this.coexistenceService.recordSuppressedCustomerMessage(phoneNumber, userText, imageUrl);
        }
        return {
          replied: false,
          replyMessage: '',
          isCallRejection: false,
          silencedReason: decision.reason
        };
      }
    }

    // 2. REGLA CRÍTICA: Respuesta de cortesía ante llamadas de voz no soportadas
    if (payload.isCallEvent) {
      const callRejectionMsg =
        '¡Hola! 🍓 Notamos tu intento de llamada. Para brindarte una atención rápida y tomar tu pedido sin demoras, escríbenos por aquí por texto.';
      await this.whatsAppService.sendMessage(phoneNumber, callRejectionMsg);
      await this.conversationRepo.addMessage(phoneNumber, {
        role: 'assistant',
        content: callRejectionMsg,
        timestamp: new Date()
      });

      return {
        replied: true,
        replyMessage: callRejectionMsg,
        isCallRejection: true
      };
    }

    // 3. SEGURIDAD Y GUARDRAILS (Pilar 6 - Input Validation & Prompt Injection Filter)
    const inputValidation = this.guardrailsService.validateInput(userText);
    if (!inputValidation.isValid) {
      this.observability.increment('guardrailBlocks');
      const securityReply =
        '¡Hola! 🍓 Con gusto te ayudamos con los pedidos de Antojitos. Por favor cuéntanos qué producto deseas ordenar.';
      await this.whatsAppService.sendMessage(phoneNumber, securityReply);
      return {
        replied: true,
        replyMessage: securityReply,
        isCallRejection: false
      };
    }

    // 4. PILAR 4: ENRUTAMIENTO RÁPIDO DE INTENCIONES (Fast Intent & Semantic Cache)
    // Si no hay imagen adjunta, evaluamos intenciones instantáneas (saludo, menú, horario, ubicación)
    if (!imageUrl && this.intentRouter) {
      const match = this.intentRouter.routeIntent(userText);
      if (match) {
        await this.conversationRepo.addMessage(phoneNumber, {
          role: 'user',
          content: userText,
          timestamp: new Date()
        });
        await this.conversationRepo.addMessage(phoneNumber, {
          role: 'assistant',
          content: match.response,
          timestamp: new Date()
        });
        let response = match.response;
        if (match.intent === 'order_status' && this.orderRepository) {
          const order = await this.orderRepository.findLatestByPhoneNumber(phoneNumber);
          response = order
            ? `🔎 Encontré tu pedido *${order.id}* asociado a este número.\n\nEstado: *${this.readableOrderStatus(order.status.value)}*\nTotal: *$${order.getTotal().amount.toLocaleString('es-CO')} COP*\n\nSi necesitas actualizar algún dato, responde a este mensaje y te ayudamos. 🍓`
            : '🔎 No encontré un pedido confirmado asociado a este número. Verifica que escribas desde el mismo teléfono usado para pedir o solicita ayuda a un asesor. 🍓';
        }
        await this.whatsAppService.sendMessage(phoneNumber, response);
        if (match.intent === 'menu_request' && this.whatsAppService.sendDocument) {
          await this.whatsAppService.sendDocument(phoneNumber, ENV.MENU_PDF_URL, 'menu_antojitos_v2.pdf', 'Menú completo de Antojitos');
        }

        return {
          replied: true,
          replyMessage: response,
          isCallRejection: false
        };
      }
    }

    // 5. PILAR 3: GESTIÓN DE HISTORIAL Y CONTEXTO JERÁRQUICO
    const state = await this.conversationRepo.getState(phoneNumber);

    // Registrar mensaje del usuario en el historial
    await this.conversationRepo.addMessage(phoneNumber, {
      role: 'user',
      content: userText,
      imageUrl,
      timestamp: new Date()
    });

    const humanContextStart = state.humanTakeoverStartedAt;
    const optimizedHistory = this.contextOptimizer.optimizeHistory(state.messages, humanContextStart);

    // El contexto de la intervención ya fue incorporado en esta reanudación;
    // la próxima conversación humana iniciará una ventana nueva.
    if (humanContextStart) {
      state.humanTakeoverStartedAt = undefined;
      state.updatedAt = new Date();
      await this.conversationRepo.saveState(state);
    }

    // 6. PILAR 1 Y 5: INFERENCIA CON MOTOR DE IA Y TOOL CALLING (CON MANEJO DE FALLBACK)
    let aiResponse: AIResponse;
    try {
      const startedAt = Date.now();
      aiResponse = await this.aiService.generateReply(
        optimizedHistory,
        userText,
        imageUrl
      );
      this.observability.recordLlmLatency(Date.now() - startedAt);
    } catch (error) {
      this.observability.increment('llmErrors');
      console.error('Error en el servicio de IA, activando fallback:', error);
      const fallbackMsg = this.guardrailsService.getFallbackResponse();
      aiResponse = { message: fallbackMsg };
      this.observability.increment('fallbackReplies');
    }

    // 7. PILAR 6: GUARDRAILS DE SALIDA (Output Validation)
    // Después de confirmar, no dejamos que el modelo convierta la respuesta
    // en otra explicación larga. La confirmación al cliente es deliberadamente
    // corta; el detalle completo ya fue enviado al canal de cocina.
    const conciseConfirmation = this.getConciseConfirmation(aiResponse);
    const outputValidation = this.guardrailsService.validateOutput(
      conciseConfirmation || aiResponse.message
    );
    const finalReply = outputValidation.sanitizedText;
    this.observability.evaluateReply(finalReply);

    // 8. Registrar respuesta del asistente en el historial
    await this.conversationRepo.addMessage(phoneNumber, {
      role: 'assistant',
      content: finalReply,
      timestamp: new Date()
    });

    // 9. Enviar mensaje de respuesta al cliente vía WhatsApp
    await this.whatsAppService.sendMessage(phoneNumber, finalReply);
    this.observability.increment('repliesSent');

    return {
      replied: true,
      replyMessage: finalReply,
      isCallRejection: false,
      aiResponse
    };
  }

  private readableOrderStatus(status: string): string {
    const labels: Record<string, string> = {
      DRAFT: 'pedido en preparación de datos',
      PENDING_PAYMENT: 'pendiente de pago',
      PAYMENT_VERIFIED: 'pago verificado',
      SENT_TO_KITCHEN: 'en preparación',
      CANCELLED: 'cancelado'
    };
    return labels[status] || 'en revisión';
  }

  private getConciseConfirmation(aiResponse: AIResponse): string | null {
    const notification = [...(aiResponse.toolCalls || [])]
      .reverse()
      .find(tool => tool.toolName === 'notificar_cocina');

    if (!notification?.result?.enviado) return null;

    const name = notification.args?.detalles_json?.cliente?.nombre;
    const orderId = notification.result?.orden_id;
    if (typeof name !== 'string' || !name.trim() || typeof orderId !== 'string') {
      return null;
    }

    return `✅ Pedido confirmado a nombre de *${name.trim()}*. Orden #${orderId}. 🍓`;
  }
}
