import { IAIService, AIResponse } from '../ports/IAIService.js';
import { IWhatsAppService } from '../ports/IWhatsAppService.js';
import { IConversationRepository } from '../../domain/repositories/IConversationRepository.js';

export interface IncomingMessagePayload {
  from: string; // Número de teléfono del cliente
  text?: string;
  imageUrl?: string;
  isCallEvent?: boolean; // Indicador de evento de llamada de voz detectado
}

export interface ProcessMessageResult {
  replied: boolean;
  replyMessage: string;
  isCallRejection: boolean;
  aiResponse?: AIResponse;
}

export class ProcessIncomingMessageUseCase {
  constructor(
    private readonly aiService: IAIService,
    private readonly whatsAppService: IWhatsAppService,
    private readonly conversationRepo: IConversationRepository
  ) {}

  public async execute(payload: IncomingMessagePayload): Promise<ProcessMessageResult> {
    const phoneNumber = payload.from.trim();

    // 1. REGLA CRÍTICA: Rechazo automático de llamadas de voz sin gastar tokens de IA
    if (payload.isCallEvent) {
      const callRejectionMsg =
        '¡Hola! Por llamadas no podemos tomar tu pedido de manera rápida. ¡Por aquí por chat te atendemos de inmediato! 🍓';
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

    const userText = payload.text || '';
    const imageUrl = payload.imageUrl;

    // 2. Obtener historial conversacional existente
    const state = await this.conversationRepo.getState(phoneNumber);

    // 3. Registrar mensaje entrante del usuario
    await this.conversationRepo.addMessage(phoneNumber, {
      role: 'user',
      content: userText,
      imageUrl,
      timestamp: new Date()
    });

    // 4. Invocar el motor de IA con Tool Calling
    const aiResponse = await this.aiService.generateReply(
      state.messages,
      userText,
      imageUrl
    );

    // 5. Registrar respuesta del asistente en el historial
    await this.conversationRepo.addMessage(phoneNumber, {
      role: 'assistant',
      content: aiResponse.message,
      timestamp: new Date()
    });

    // 6. Enviar mensaje de respuesta al cliente vía WhatsApp
    await this.whatsAppService.sendMessage(phoneNumber, aiResponse.message);

    return {
      replied: true,
      replyMessage: aiResponse.message,
      isCallRejection: false,
      aiResponse
    };
  }
}
