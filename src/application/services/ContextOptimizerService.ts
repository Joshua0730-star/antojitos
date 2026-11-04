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

    // Los acuerdos alcanzados durante una intervención humana tienen prioridad
    // al reanudar el bot, pero siguen estando limitados por la ventana máxima.
    // Una pausa larga no debe hacer crecer el prompt sin límite.
    if (preserveFrom) {
      const beforeTakeover = history.filter(message => message.timestamp < preserveFrom);
      const duringTakeover = history.filter(message => message.timestamp >= preserveFrom);
      const preserved = duringTakeover.slice(-this.maxMessages);
      const remainingSlots = Math.max(0, this.maxMessages - preserved.length);

      // Se conserva el contexto inmediatamente anterior solo para completar
      // la ventana. El contenido acordado durante la pausa siempre prevalece.
      return [
        ...(remainingSlots > 0 ? beforeTakeover.slice(-remainingSlots) : []),
        ...preserved
      ];
    }

    // Tomar los últimos N mensajes configurados
    const trimmed = history.slice(-this.maxMessages);

    // Asegurar que si el primer mensaje en la ventana recortada es del asistente,
    // se mantenga contexto coherente
    return trimmed;
  }
}
