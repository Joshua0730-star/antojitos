import { ICacheService } from '../../infrastructure/cache/RedisService.js';
import { ProcessIncomingMessageUseCase, IncomingMessagePayload, ProcessMessageResult } from '../use-cases/ProcessIncomingMessageUseCase.js';
import { ENV } from '../../infrastructure/config/env.js';
import type { OperatingScheduleService } from './OperatingScheduleService.js';

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
  private readonly recoveryTimer: NodeJS.Timeout;
  private readonly bufferTtlSeconds = 10 * 60;
  private readonly dueIndexKey = 'buffer:due:index';

  constructor(
    private readonly cacheService: ICacheService,
    private readonly processUseCase: ProcessIncomingMessageUseCase,
    private readonly debounceMs: number = ENV.MESSAGE_DEBOUNCE_MS,
    private readonly operatingSchedule?: OperatingScheduleService
  ) {
    // Redis-backed recovery means a restart of the replica that received the
    // webhook does not strand a buffered conversation behind a local timer.
    this.recoveryTimer = setInterval(() => {
      void this.recoverDueBuffers().catch(error => {
        console.error('[debouncer] recovery worker failed', error instanceof Error ? error.message : String(error));
      });
    }, Math.max(250, Math.min(this.debounceMs, 1_000)));
    this.recoveryTimer.unref?.();
  }

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
      await this.cacheService.pushToList(bufferKey, userText, this.bufferTtlSeconds);
      await this.cacheService.set(`buffer:last:${phoneNumber}`, String(Date.now()), this.bufferTtlSeconds);
      if (payload.messageId) await this.cacheService.set(`buffer:last-id:${phoneNumber}`, payload.messageId, this.bufferTtlSeconds);
      await this.cacheService.set(`buffer:due:${phoneNumber}`, String(Date.now() + this.debounceMs), this.bufferTtlSeconds);
      await this.cacheService.pushToList(this.dueIndexKey, phoneNumber, this.bufferTtlSeconds);
    }

    // 3. Cancelar temporizador previo si existía (debounce)
    const existingTimer = this.timers.get(phoneNumber);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // 4. Programar ejecución agrupada tras expirar la ventana de tiempo
    const timer = setTimeout(async () => {
      this.timers.delete(phoneNumber);
      try {
        await this.flushAndExecute(phoneNumber);
      } catch (error) {
        console.error('[debouncer] failed to process queued message', {
          phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, '*'),
          error: error instanceof Error ? error.message : String(error)
        });
      }
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
    const lockKey = `debounce:${phoneNumber}`;
    const acquired = await this.cacheService.acquireLock(lockKey, 30);
    if (!acquired) return [];

    try {
      const drained = await this.cacheService.drainList(bufferKey);
      await this.cacheService.del(`buffer:due:${cleanPhone}`);
      await this.cacheService.del(`buffer:last:${cleanPhone}`);
      await this.cacheService.del(`buffer:last-id:${cleanPhone}`);
      return drained;
    } finally {
      await this.cacheService.releaseLock(lockKey);
    }
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
    const requestId = immediatePayload?.messageId || await this.cacheService.get(`buffer:last-id:${phoneNumber}`) || undefined;
    const lastMessageAt = await this.cacheService.get(`buffer:last:${phoneNumber}`);
    if (!immediatePayload && lastMessageAt) {
      const elapsed = Date.now() - Number(lastMessageAt);
      if (Number.isFinite(elapsed) && elapsed < this.debounceMs) {
        const timer = setTimeout(() => {
          this.timers.delete(phoneNumber);
          void this.flushAndExecute(phoneNumber).catch(error => {
            console.error('[debouncer] failed to process delayed buffer', error);
          });
        }, this.debounceMs - elapsed);
        this.timers.set(phoneNumber, timer);
        return null;
      }
    }

    const debounceLock = `debounce:${phoneNumber}`;
    const debounceAcquired = await this.cacheService.acquireLock(debounceLock, 30);
    if (!debounceAcquired) return null;

    let bufferedTexts: string[];
    try {
      bufferedTexts = await this.cacheService.drainList(bufferKey);
      await this.cacheService.del(`buffer:last:${phoneNumber}`);
      await this.cacheService.del(`buffer:last-id:${phoneNumber}`);
    } finally {
      await this.cacheService.releaseLock(debounceLock);
    }

    // Concatenar los fragmentos acumulados
    let combinedText = bufferedTexts.join('\n').trim();
    if (immediatePayload?.text) {
      combinedText = combinedText ? `${combinedText}\n${immediatePayload.text}` : immediatePayload.text;
    }

    // Si no hay texto ni imagen ni evento, nada que procesar
    if (!combinedText && !immediatePayload?.imageUrl && !immediatePayload?.isCallEvent) {
      return null;
    }

    // El webhook valida el horario al recibir el mensaje, pero el debouncer
    // puede ejecutar varios segundos después. Revalidar aquí evita que un
    // mensaje encolado antes del cierre termine invocando IA o creando un
    // pedido fuera de horario.
    if (this.operatingSchedule && !(await this.operatingSchedule.isOpenAsync())) {
      return null;
    }

    // Adquirir candado de concurrencia para el usuario
    const lockKey = `user:${phoneNumber}`;
    const acquired = await this.cacheService.acquireLock(lockKey, 30);

    if (!acquired) {
      console.warn(`⏳ Usuario ${phoneNumber} ya tiene un turno en procesamiento. Reintentando...`);
      // Si está bloqueado, reencolar en buffer para el siguiente turno
      if (combinedText) {
        await this.cacheService.pushToList(bufferKey, combinedText, this.bufferTtlSeconds);
        await this.cacheService.set(`buffer:last:${phoneNumber}`, String(Date.now()), this.bufferTtlSeconds);
        await this.cacheService.set(`buffer:due:${phoneNumber}`, String(Date.now() + this.debounceMs), this.bufferTtlSeconds);
        await this.cacheService.pushToList(this.dueIndexKey, phoneNumber, this.bufferTtlSeconds);
      }
      return null;
    }

    try {
      return await this.processUseCase.execute({
        from: phoneNumber,
        text: combinedText,
        imageUrl: immediatePayload?.imageUrl,
        isCallEvent: immediatePayload?.isCallEvent,
        messageId: requestId
      });
    } finally {
      await this.cacheService.releaseLock(lockKey);
    }
  }

  /**
   * Recovers due buffers from a shared Redis list. drainList is atomic, so one
   * replica claims each index batch; the per-phone lock protects against a
   * local timer or another recovery cycle processing the same conversation.
   */
  private async recoverDueBuffers(): Promise<void> {
    const entries = await this.cacheService.drainList(this.dueIndexKey);
    if (!entries.length) return;
    const now = Date.now();
    for (const phoneNumber of [...new Set(entries.map(value => value.trim()).filter(Boolean))]) {
      const dueValue = await this.cacheService.get(`buffer:due:${phoneNumber}`);
      const dueAt = Number(dueValue);
      if (!Number.isFinite(dueAt)) continue;
      if (dueAt > now) {
        await this.cacheService.pushToList(this.dueIndexKey, phoneNumber, this.bufferTtlSeconds);
        continue;
      }
      const recoveryLock = `debounce:recovery:${phoneNumber}`;
      if (!(await this.cacheService.acquireLock(recoveryLock, 30))) {
        await this.cacheService.pushToList(this.dueIndexKey, phoneNumber, this.bufferTtlSeconds);
        continue;
      }
      try {
        const currentDue = await this.cacheService.get(`buffer:due:${phoneNumber}`);
        if (!currentDue || Number(currentDue) > Date.now()) {
          if (currentDue) await this.cacheService.pushToList(this.dueIndexKey, phoneNumber, this.bufferTtlSeconds);
          continue;
        }
        await this.cacheService.del(`buffer:due:${phoneNumber}`);
        await this.flushAndExecute(phoneNumber);
      } finally {
        await this.cacheService.releaseLock(recoveryLock);
      }
    }
  }
}
