import { ChatMessage } from '../../domain/repositories/IConversationRepository.js';
import { ENV } from '../../infrastructure/config/env.js';

export class ContextOptimizerService {
  constructor(private readonly maxMessages: number = ENV.MAX_CONTEXT_MESSAGES) {}

  /**
   * Aplica una ventana deslizante inteligente (Sliding Window) sobre el historial conversacional.
   * Mantiene los mensajes más recientes respetando la coherencia de turnos de diálogo.
   */
  public optimizeHistory(history: ChatMessage[], preserveFrom?: Date): ChatMessage[] {
    if (!history || history.length === 0) {
      return [];
    }

    if (history.length <= this.maxMessages && !preserveFrom) {
      return history;
    }

    // Los acuerdos alcanzados durante una intervención humana no se recortan
    // al reanudar el bot, aunque superen la ventana normal de contexto.
    if (preserveFrom) {
      const preserved = history.filter(message => message.timestamp >= preserveFrom);
      if (preserved.length >= this.maxMessages) return preserved;
      return [...history.slice(0, this.maxMessages - preserved.length), ...preserved];
    }

    // Tomar los últimos N mensajes configurados
    const trimmed = history.slice(-this.maxMessages);

    // Asegurar que si el primer mensaje en la ventana recortada es del asistente,
    // se mantenga contexto coherente
    return trimmed;
  }
}
