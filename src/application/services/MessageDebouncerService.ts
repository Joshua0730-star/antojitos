import { ICacheService } from '../../infrastructure/cache/RedisService.js';
import { ProcessIncomingMessageUseCase, IncomingMessagePayload, ProcessMessageResult } from '../use-cases/ProcessIncomingMessageUseCase.js';
import { ENV } from '../../infrastructure/config/env.js';

export interface QueuedMessage {
  from: string;
  text?: string;
  imageUrl?: string;
  isCallEvent?: boolean;
  messageId?: string;
  timestamp: number;
}

export class MessageDebouncerService {
  private timers: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private readonly cacheService: ICacheService,
    private readonly processUseCase: ProcessIncomingMessageUseCase,
    private readonly debounceMs: number = ENV.MESSAGE_DEBOUNCE_MS
  ) {}

  /**
   * Encola un mensaje entrante. Si el usuario escribe varios mensajes seguidos,
   * se agrupan en una sola solicitud para el agente de IA.
   */
  public async enqueueMessage(
    payload: IncomingMessagePayload & { messageId?: string }
  ): Promise<void> {
    const phoneNumber = payload.from.trim();

    // 1. Si es llamada de voz o imagen de comprobante, procesar de inmediato sin debounce
    if (payload.isCallEvent || payload.imageUrl) {
      await this.flushAndExecute(phoneNumber, payload);
      return;
    }

    // 2. Guardar el fragmento de texto en el buffer de Redis / Memoria
    const userText = payload.text?.trim();
    if (userText) {
      const bufferKey = `buffer:msg:${phoneNumber}`;
      await this.cacheService.pushToList(bufferKey, userText, 120);
    }

    // 3. Cancelar temporizador previo si existía (debounce)
    const existingTimer = this.timers.get(phoneNumber);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // 4. Programar ejecución agrupada tras expirar la ventana de tiempo
    const timer = setTimeout(async () => {
      this.timers.delete(phoneNumber);
      await this.flushAndExecute(phoneNumber);
    }, this.debounceMs);

    this.timers.set(phoneNumber, timer);
  }

  /**
   * Cancela inmediatamente cualquier temporizador activo o buffer acumulado
   * cuando un operador humano interviene en la conversación (Coexistencia).
   */
  public async cancelPending(phoneNumber: string): Promise<string[]> {
    const cleanPhone = phoneNumber.trim();
    const existingTimer = this.timers.get(cleanPhone);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.timers.delete(cleanPhone);
    }
    const bufferKey = `buffer:msg:${cleanPhone}`;
    const bufferedTexts = await this.cacheService.getList(bufferKey);
    await this.cacheService.del(bufferKey);
    return bufferedTexts;
  }

  /**
   * Extrae el buffer acumulado y ejecuta el caso de uso con el candado de concurrencia.
   */
  public async flushAndExecute(
    phoneNumber: string,
    immediatePayload?: IncomingMessagePayload
  ): Promise<ProcessMessageResult | null> {
    // Limpiar temporizador si existe
    const activeTimer = this.timers.get(phoneNumber);
    if (activeTimer) {
      clearTimeout(activeTimer);
      this.timers.delete(phoneNumber);
    }

    const bufferKey = `buffer:msg:${phoneNumber}`;
    const bufferedTexts = await this.cacheService.getList(bufferKey);
    await this.cacheService.del(bufferKey);

    // Concatenar los fragmentos acumulados
    let combinedText = bufferedTexts.join('\n').trim();
    if (immediatePayload?.text) {
      combinedText = combinedText ? `${combinedText}\n${immediatePayload.text}` : immediatePayload.text;
    }

    // Si no hay texto ni imagen ni evento, nada que procesar
    if (!combinedText && !immediatePayload?.imageUrl && !immediatePayload?.isCallEvent) {
      return null;
    }

    // Adquirir candado de concurrencia para el usuario
    const lockKey = `user:${phoneNumber}`;
    const acquired = await this.cacheService.acquireLock(lockKey, 30);

    if (!acquired) {
      console.warn(`⏳ Usuario ${phoneNumber} ya tiene un turno en procesamiento. Reintentando...`);
      // Si está bloqueado, reencolar en buffer para el siguiente turno
      if (combinedText) {
        await this.cacheService.pushToList(bufferKey, combinedText, 120);
      }
      return null;
    }

    try {
      return await this.processUseCase.execute({
        from: phoneNumber,
        text: combinedText,
        imageUrl: immediatePayload?.imageUrl,
        isCallEvent: immediatePayload?.isCallEvent
      });
    } finally {
      await this.cacheService.releaseLock(lockKey);
    }
  }
}
