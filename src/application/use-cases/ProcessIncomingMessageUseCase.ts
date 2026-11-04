import { IAIService, AIResponse, classifyAIError } from '../ports/IAIService.js';
import { IWhatsAppService, type WhatsAppInteractiveList } from '../ports/IWhatsAppService.js';
import { IConversationRepository } from '../../domain/repositories/IConversationRepository.js';
import { ContextOptimizerService } from '../services/ContextOptimizerService.js';
import { CoexistenceService } from '../services/CoexistenceService.js';
import { IntentRouterService } from '../services/IntentRouterService.js';
import { GuardrailsService } from '../services/GuardrailsService.js';
import { ObservabilityService } from '../services/ObservabilityService.js';
import { ENV } from '../../infrastructure/config/env.js';
import { IOrderRepository } from '../../domain/repositories/IOrderRepository.js';
import { createOrderFsm, type OrderState } from '../../domain/fsm/orderFsm.js';
import type { ConversationState } from '../../domain/repositories/IConversationRepository.js';

export interface IncomingMessagePayload {
  from: string; // Teléfono, JID o LID del cliente
  text?: string;
  imageUrl?: string;
  isCallEvent?: boolean; // Indicador de evento de llamada de voz detectado
  messageId?: string;
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
        author: 'bot',
        source: 'bot_api',
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

    // 4. FSM determinista opcional. Está desactivada por defecto para preservar
    // el comportamiento histórico y se habilita explícitamente por entorno.
    let state: ConversationState | undefined;
    if (this.isDeterministicFsmEnabled() && !imageUrl && userText.trim()) {
      state = await this.conversationRepo.getState(phoneNumber);
      const fsmResult = createOrderFsm(state.fsmSession).transition({
        type: 'MESSAGE',
        text: userText
      });
      state.fsmSession = fsmResult.session;
      state.updatedAt = new Date();

      // La FSM usa accepted para indicar que la transición fue válida. Su
      // respuesta genérica de reintento, sin embargo, deja el turno al LLM
      // para conservar la capacidad conversacional del flujo existente.
      const resolved = fsmResult.accepted && (
        fsmResult.session.unknownAttempts === 0 ||
        fsmResult.session.state === 'HANDOFF'
      );

      if (resolved) {
        const now = new Date();
        state.messages.push(
          { role: 'user', content: userText, timestamp: now },
          { role: 'assistant', content: fsmResult.reply, timestamp: now }
        );
        await this.conversationRepo.saveState(state);

        if (fsmResult.session.state === 'HANDOFF' && this.coexistenceService) {
          await this.coexistenceService.registerHumanEcho(phoneNumber);
        }

        await this.whatsAppService.sendMessage(phoneNumber, fsmResult.reply);
        this.observability.increment('repliesSent');
        return {
          replied: true,
          replyMessage: fsmResult.reply,
          isCallRejection: false
        };
      }

      // Persistimos también los intentos no resueltos para que el segundo
      // intento pueda activar el handoff determinista.
      await this.conversationRepo.saveState(state);
    }

    // 5. Estado sombra del pedido: registra slots confiables sin sustituir aún
    // la respuesta de IA. Esto permite reanudar una conversación sin releer
    // todo el chat ni volver a preguntar datos ya entregados.
    if (!imageUrl && this.isOrderContextMessage(userText)) {
      // Cuando la FSM determinista ya procesó este turno, no lo transiciones
      // una segunda vez: hacerlo duplicaba unknownAttempts y podía enviar a
      // clientes válidos a handoff después de dos mensajes normales.
      state ||= await this.conversationRepo.getState(phoneNumber);
      if (!this.isDeterministicFsmEnabled()) this.trackOrderContext(state, userText);
      await this.conversationRepo.saveState(state);
    }

    // 6. PILAR 4: ENRUTAMIENTO RÁPIDO DE INTENCIONES (Fast Intent & Semantic Cache)
    // Si no hay imagen adjunta, evaluamos intenciones instantáneas (saludo, menú, horario, ubicación)
    if (!imageUrl && this.intentRouter) {
      state ||= await this.conversationRepo.getState(phoneNumber);
      const match = this.intentRouter.routeIntent(userText);
      // Una pregunta de total con “domi” depende del carrito ya armado. No
      // la resolvemos como FAQ sin contexto: dejamos que el modelo use el
      // estado estructurado y calcule domicilio + total con las herramientas.
      const contextualPriceQuery = match?.intent === 'price_query' &&
        !this.hasExplicitProductReference(userText) &&
        Boolean(state?.fsmSession?.cart?.length);
      const contextualNumberChoice = /^\d{1,2}$/.test(userText.trim()) &&
        Boolean(state?.fsmSession && state.fsmSession.state !== 'IDLE');
      if (match && !contextualPriceQuery && !contextualNumberChoice) {
        await this.conversationRepo.addMessage(phoneNumber, {
          role: 'user',
          author: 'customer',
          source: 'whatsapp_customer',
          content: userText,
          timestamp: new Date()
        });
        await this.conversationRepo.addMessage(phoneNumber, {
          role: 'assistant',
          author: 'bot',
          source: 'bot_api',
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
        const interactiveList = this.interactiveListFor(match.intent, response);
        const sentInteractive = interactiveList && this.whatsAppService.sendInteractiveList
          ? await this.whatsAppService.sendInteractiveList(phoneNumber, interactiveList)
          : false;
        if (!sentInteractive) await this.whatsAppService.sendMessage(phoneNumber, response);
        if (match.intent === 'menu_request') {
          const sentPdf = this.whatsAppService.sendDocument
            ? await this.whatsAppService.sendDocument(phoneNumber, ENV.MENU_PDF_URL, 'menu_antojitos_v2.pdf', 'Menú completo de Antojitos')
            : false;
          if (!sentPdf) {
            console.error('[menu] no se pudo enviar el PDF', { phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, '*'), menuUrl: ENV.MENU_PDF_URL });
            await this.whatsAppService.sendMessage(phoneNumber, `Puedes abrir el menú aquí: ${ENV.MENU_PDF_URL}`);
          }
        }

        return {
          replied: true,
          replyMessage: response,
          isCallRejection: false
        };
      }
    }

    // 7. PILAR 3: GESTIÓN DE HISTORIAL Y CONTEXTO JERÁRQUICO
    state ||= await this.conversationRepo.getState(phoneNumber);

    // Registrar mensaje del usuario en el historial
    await this.conversationRepo.addMessage(phoneNumber, {
      role: 'user',
      author: 'customer',
      source: 'whatsapp_customer',
      content: userText,
      imageUrl,
      timestamp: new Date()
    });

    const humanContextStart = state.humanTakeoverStartedAt;
    const optimizedHistory = [...this.contextOptimizer.optimizeHistory(state.messages, humanContextStart)];
    if (state.fsmSession) {
      optimizedHistory.push({
        role: 'user',
        author: 'system',
        source: 'system',
        content: this.formatOrderContext(state.fsmSession),
        timestamp: new Date()
      });
    }

    // El contexto de la intervención ya fue incorporado en esta reanudación;
    // la próxima conversación humana iniciará una ventana nueva.
    if (humanContextStart) {
      // Reload after persisting the current user message. Another replica or
      // the operator may have appended messages while the AI was preparing
      // the response; saving the stale snapshot here would erase them.
      const latestState = await this.conversationRepo.getState(phoneNumber);
      latestState.humanTakeoverStartedAt = undefined;
      latestState.updatedAt = new Date();
      await this.conversationRepo.saveState(latestState);
    }

    // 7. PILAR 1 Y 5: INFERENCIA CON MOTOR DE IA Y TOOL CALLING (CON MANEJO DE FALLBACK)
    let aiResponse: AIResponse;
    try {
      const startedAt = Date.now();
      aiResponse = await this.aiService.generateReply(
        optimizedHistory,
        userText,
        imageUrl,
        payload.messageId
      );
      this.observability.recordLlmLatency(Date.now() - startedAt);
    } catch (error) {
      const failure = classifyAIError(error);
      this.observability.recordLlmError(failure.kind);
      console.error('[ai] generation failed; activating fallback', {
        kind: failure.kind,
        retryable: failure.retryable,
        status: failure.status,
        message: failure.message
      });
      const fallbackMsg = this.guardrailsService.getFallbackResponse();
      aiResponse = { message: fallbackMsg };
      this.observability.increment('fallbackReplies');
    }

    // 8. PILAR 6: GUARDRAILS DE SALIDA (Output Validation)
    // Después de confirmar, no dejamos que el modelo convierta la respuesta
    // en otra explicación larga. La confirmación al cliente es deliberadamente
    // corta; el detalle completo ya fue enviado al canal de cocina.
    const paymentReply = this.getPaymentReply(aiResponse);
    const conciseConfirmation = paymentReply || this.getConciseConfirmation(aiResponse);
    const guardedReply = conciseConfirmation || this.preventUnverifiedConfirmation(aiResponse.message, aiResponse);
    const outputValidation = this.guardrailsService.validateOutput(
      guardedReply
    );
    const finalReply = outputValidation.sanitizedText;
    this.observability.evaluateReply(finalReply);

    await this.syncOrderStateFromTools(phoneNumber, aiResponse);

    // 9. Registrar respuesta del asistente en el historial
    await this.conversationRepo.addMessage(phoneNumber, {
      role: 'assistant',
      author: 'bot',
      source: 'bot_api',
      content: finalReply,
      timestamp: new Date()
    });

    // 10. Enviar mensaje de respuesta al cliente vía WhatsApp
    await this.whatsAppService.sendMessage(phoneNumber, finalReply);
    this.observability.increment('repliesSent');

    return {
      replied: true,
      replyMessage: finalReply,
      isCallRejection: false,
      aiResponse
    };
  }

  /** Convierte solo respuestas deterministas y de elección en listas nativas.
   * Si el proveedor falla, el llamador conserva la respuesta numerada. */
  private interactiveListFor(intent: string, response: string): WhatsAppInteractiveList | undefined {
    const rows = (items: Array<[string, string, string?]>) => items.map(([id, title, description]) => ({ id, title, description }));
    if (intent === 'greeting') return {
      header: 'Antojitos', body: '¿Qué deseas hacer?', button: 'Ver opciones',
      sections: [{ title: 'Opciones', rows: rows([['menu', 'Ver el menú'], ['order', 'Hacer un pedido'], ['status', 'Estado del pedido']]) }]
    };
    if (intent === 'start_order') return {
      header: 'Pedido', body: 'Elige tu producto:', button: 'Elegir producto',
      sections: [{ rows: rows([['fresas', 'Fresas con crema'], ['oblea', 'Oblea'], ['ensalada', 'Ensalada de frutas'], ['sandwich', 'Sándwich']]) }]
    };
    if (intent === 'payment_methods' && /elige cómo pagar/i.test(response)) return {
      body: 'Elige cómo pagar:', button: 'Método de pago',
      sections: [{ rows: rows([['nequi', 'Nequi'], ['efectivo', 'Efectivo contra entrega']]) }]
    };
    if ((intent === 'product_customization' || /Elige 1 salsa/i.test(response)) && /Elige 1 salsa/i.test(response)) return {
      body: 'Elige 1 salsa:', button: 'Elegir salsa',
      sections: [{ rows: rows([['mora', 'Mora'], ['fresa', 'Fresa'], ['arequipe', 'Arequipe'], ['leche_condensada', 'Leche condensada'], ['chocolate', 'Chocolate']]) }]
    };
    if (intent === 'product_customization' && /Elige 1 topping/i.test(response)) return {
      body: 'Elige 1 topping:', button: 'Elegir topping',
      sections: [{ rows: rows([['brownie', 'Brownie'], ['chocorramo', 'Chocorramo'], ['oreo', 'Oreo'], ['queso', 'Queso'], ['minichip', 'Minichip']]) }]
    };
    if (intent === 'product_customization' && /Cómo lo entregamos/i.test(response)) return {
      body: '¿Cómo lo entregamos?', button: 'Elegir entrega',
      sections: [{ rows: rows([['domicilio', 'Domicilio'], ['recoger', 'Recoger']]) }]
    };
    if (intent === 'product_selection' && /Elige tamaño/i.test(response)) return {
      body: 'Elige el tamaño:', button: 'Elegir tamaño',
      sections: [{ rows: rows([['9oz', '9 oz (Personal)', '$13.000'], ['10oz', '10 oz', '$15.000'], ['12oz', '12 oz', '$18.000'], ['16oz', '16 oz', '$20.000']]) }]
    };
    if (intent === 'product_selection' && /Elige una oblea/i.test(response)) return {
      body: 'Elige una oblea:', button: 'Elegir oblea',
      sections: [{ rows: rows([['sencilla', 'Sencilla', '$5.000'], ['mini_especial', 'Mini especial', '$8.000'], ['especial', 'Especial', '$12.000'], ['cuchareable', 'Cuchareable', '$20.000']]) }]
    };
    return undefined;
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

  private isDeterministicFsmEnabled(): boolean {
    return process.env.ENABLE_DETERMINISTIC_FSM?.trim().toLowerCase() === 'true';
  }

  private isOrderContextMessage(text: string): boolean {
    return /fresas?|obleas?|ensalada|sandwich|sándwich|pedido|ordenar|pedir|domicilio|envi\w*|recoger|recogida|direccion|dirección|barrio|frente|esquina|nequi|daviplata|efectivo|contra entrega/i.test(text);
  }

  private hasExplicitProductReference(text: string): boolean {
    return /fresas?|obleas?|ensalada(?:s)?|sandwich(?:es)?|bowl|bandeja/i.test(text);
  }

  private trackOrderContext(state: ConversationState, text: string): void {
    try {
      const tracker = createOrderFsm(state.fsmSession);
      const result = tracker.transition({ type: 'MESSAGE', text });
      if (!result.accepted || result.session.state === 'HANDOFF') return;

      state.fsmSession = result.session;
      state.currentStep = this.stepForOrderState(result.session.state);
      state.updatedAt = new Date();
    } catch {
      // El seguimiento es auxiliar. Un mensaje extraño nunca debe impedir
      // que el flujo principal responda con IA.
    }
  }

  private stepForOrderState(state: OrderState): number {
    switch (state) {
      case 'IDLE':
      case 'EXPLORING_MENU':
        return 1;
      case 'CONFIGURING_PRODUCT':
        return 2;
      case 'COLLECTING_DELIVERY':
        return 3;
      case 'PAYMENT':
        return 4;
      case 'CONFIRMATION':
      case 'HANDOFF':
        return 5;
      default:
        return 1;
    }
  }

  private formatOrderContext(session: NonNullable<ConversationState['fsmSession']>): string {
    const delivery = session.delivery;
    const items = session.cart.length > 0
      ? session.cart.map(item => `${item.quantity}x ${item.productName} ${item.sizeOz} oz`).join('; ')
      : 'sin producto estructurado todavía';
    const payment = session.payment?.method || 'sin método definido';
    return '[ESTADO ESTRUCTURADO DEL PEDIDO — no inventes ni sobrescribas estos datos] '
      + `Productos: ${items}. `
      + `Modalidad: ${delivery.mode}${delivery.modeConfirmed ? ' confirmada' : ' inferida/no confirmada'}. `
      + `Nombre: ${delivery.customerName || 'pendiente'}. `
      + `Dirección: ${delivery.address || 'pendiente'}. `
      + `Barrio: ${delivery.neighborhood || 'pendiente'}. `
      + `Pago: ${payment}. `
      + 'Consulta el order_id persistido antes de crear otra orden. '
      + 'Pregunta únicamente el dato que falte y confirma la modalidad si fue inferida.';
  }

  private async syncOrderStateFromTools(phoneNumber: string, aiResponse: AIResponse): Promise<void> {
    const notification = [...(aiResponse.toolCalls || [])]
      .reverse()
      .find(tool => tool.toolName === 'notificar_cocina' && tool.result?.enviado === true);
    const validation = [...(aiResponse.toolCalls || [])]
      .reverse()
      .find(tool => tool.toolName === 'validar_comprobante_nequi');
    if (!notification && !validation) return;

    const state = await this.conversationRepo.getState(phoneNumber);
    if (notification?.result?.orden_id) {
      state.currentOrderId = String(notification.result.orden_id);
      state.currentStep = 6;
    }
    if (validation?.result?.exito === true && state.fsmSession?.payment) {
      state.fsmSession.payment.status = 'READY_FOR_CONFIRMATION';
      state.fsmSession.payment.reference = String(validation.result.referencia || '');
      state.currentStep = 6;
    }
    state.updatedAt = new Date();
    await this.conversationRepo.saveState(state);
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

    // Crear la orden y avisar a cocina no equivale a verificar el pago. En
    // Nequi el comprobante debe validarse antes de confirmar la venta.
    const paymentMethod = String(notification.args?.detalles_json?.metodo_pago || '').toUpperCase();
    if (paymentMethod === 'NEQUI') {
      const validation = [...(aiResponse.toolCalls || [])]
        .reverse()
        .find(tool => tool.toolName === 'validar_comprobante_nequi');
      if (validation?.result?.exito !== true) {
        return `🧾 Pedido recibido a nombre de *${name.trim()}*. Orden #${orderId}. Envíame el comprobante de Nequi para verificar el pago antes de prepararlo. 🍓`;
      }
    }

    return `✅ Pedido confirmado a nombre de *${name.trim()}*. Orden #${orderId}. 🍓`;
  }

  private getPaymentReply(aiResponse: AIResponse): string | null {
    const validation = [...(aiResponse.toolCalls || [])]
      .reverse()
      .find(tool => tool.toolName === 'validar_comprobante_nequi');
    if (!validation) return null;

    const result = validation.result;
    if (result?.exito === true) {
      return `✅ Comprobante recibido y pago verificado. Referencia *${String(result.referencia || '').slice(-4)}*. Tu pedido continúa en preparación. 🍓`;
    }
    if (typeof result?.mensaje === 'string' && /revisi[oó]n humana|orden ya no est[aá] disponible/i.test(result.mensaje)) {
      return '⚠️ Recibimos tu comprobante, pero necesita revisión humana. Conservamos tu pedido y un encargado confirmará el pago. 🍓';
    }
    if (typeof result?.mensaje === 'string') {
      return `⚠️ No pudimos verificar el comprobante todavía: ${result.mensaje} Envía una captura legible y completa para revisarlo. 🍓`;
    }
    return '⚠️ Recibimos el comprobante, pero no pudimos verificarlo. Un encargado revisará el pago antes de preparar el pedido. 🍓';
  }

  private preventUnverifiedConfirmation(message: string, aiResponse: AIResponse): string {
    const hasOrderCreation = (aiResponse.toolCalls || []).some(tool =>
      tool.toolName === 'notificar_cocina' && tool.result?.enviado === true
    );
    if (!hasOrderCreation && /pedido\s+(?:est[aá]|qued[oó])\s+confirmad|orden\s+confirmad|pago\s+verificad/i.test(message)) {
      return '🧾 Todavía no confirmo el pedido. Primero validaré los productos, datos de entrega y método de pago para evitar errores. 🍓';
    }
    return message;
  }
}
