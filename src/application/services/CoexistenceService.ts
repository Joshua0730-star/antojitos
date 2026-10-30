import { IConversationRepository, CoexistenceStatus } from '../../domain/repositories/IConversationRepository.js';
import { MessageDebouncerService } from './MessageDebouncerService.js';
import { ENV } from '../../infrastructure/config/env.js';
import { normalizeContactIdentity } from '../utils/contactIdentity.js';

export interface CoexistenceDecision {
  canRespond: boolean;
  status: CoexistenceStatus;
  reason?: string;
  isCommandHandled?: boolean;
}

export class CoexistenceService {
  constructor(
    private readonly conversationRepo: IConversationRepository,
    private readonly debouncerService?: MessageDebouncerService,
    private readonly cooldownMinutes: number = ENV.COEXISTENCE_COOLDOWN_MINUTES
  ) {}

  /**
   * Registra un evento Echo (el operador humano respondió desde la app móvil de WhatsApp Business).
   * Cambia el estado a HUMAN_TAKE-OVER, actualiza la marca de tiempo y cancela temporizadores del bot.
   */
  public async registerHumanEcho(customerPhone: string, messageText = ''): Promise<void> {
    const cleanPhone = normalizeContactIdentity(customerPhone);
    const state = await this.conversationRepo.getState(cleanPhone);
    const wasHumanTakeover = state.coexistenceStatus === 'HUMAN_TAKE-OVER';
    const now = new Date();

    state.coexistenceStatus = 'HUMAN_TAKE-OVER';
    state.lastHumanInteraction = now;
    if (!wasHumanTakeover || !state.humanTakeoverStartedAt) state.humanTakeoverStartedAt = now;
    state.botPausedIndefinitely = false;
    state.updatedAt = now;

    await this.conversationRepo.saveState(state);

    // Se agrega después de guardar el estado para no sobrescribir mensajes
    // del cliente que pudieran llegar concurrentemente.
    if (messageText.trim()) {
      await this.conversationRepo.addMessage(cleanPhone, {
        role: 'assistant',
        content: messageText,
        timestamp: now
      });
    }

    // Cancelar cualquier mensaje acumulado en debounce o temporizador activo para este cliente
    if (this.debouncerService) {
      const bufferedMessages = await this.debouncerService.cancelPending(cleanPhone);
      await this.persistBufferedCustomerMessages(cleanPhone, bufferedMessages, now);
    }
  }

  /** Conserva mensajes del cliente que llegaron mientras el bot estaba silenciado. */
  public async recordSuppressedCustomerMessage(
    customerPhone: string,
    messageText = '',
    imageUrl?: string
  ): Promise<void> {
    if (!messageText.trim() && !imageUrl) return;

    const cleanPhone = normalizeContactIdentity(customerPhone);
    await this.conversationRepo.addMessage(cleanPhone, {
      role: 'user',
      content: messageText,
      imageUrl,
      timestamp: new Date()
    });
  }

  /**
   * Procesa comandos de control en tiempo real (!bot on / !bot off)
   */
  public async handleCommand(customerPhone: string, text: string): Promise<boolean> {
    const cleanPhone = normalizeContactIdentity(customerPhone);
    const trimmed = text.trim().toLowerCase();

    if (trimmed === '!bot on') {
      const state = await this.conversationRepo.getState(cleanPhone);
      state.coexistenceStatus = 'BOT_ACTIVE';
      state.botPausedIndefinitely = false;
      state.humanPauseUntil = undefined;
      state.updatedAt = new Date();
      await this.conversationRepo.saveState(state);
      return true;
    }

    if (trimmed === '!bot off') {
      const state = await this.conversationRepo.getState(cleanPhone);
      state.coexistenceStatus = 'HUMAN_TAKE-OVER';
      state.botPausedIndefinitely = true;
      state.lastHumanInteraction = new Date();
      state.humanTakeoverStartedAt = state.humanTakeoverStartedAt || state.lastHumanInteraction;
      state.humanPauseUntil = undefined;
      state.updatedAt = new Date();
      await this.conversationRepo.saveState(state);
      return true;
    }

    return false;
  }

  /** Pausa una conversación durante una duración elegida por el administrador. */
  public async pauseConversation(customerPhone: string, minutes: number): Promise<Date> {
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
      throw new Error('La duración debe ser un número entero entre 1 y 1440 minutos');
    }
    const cleanPhone = normalizeContactIdentity(customerPhone);
    const now = new Date();
    const pauseUntil = new Date(now.getTime() + minutes * 60_000);
    const state = await this.conversationRepo.getState(cleanPhone);
    state.coexistenceStatus = 'HUMAN_TAKE-OVER';
    state.lastHumanInteraction = now;
    state.humanPauseUntil = pauseUntil;
    state.humanTakeoverStartedAt = now;
    state.botPausedIndefinitely = false;
    state.updatedAt = now;
    await this.conversationRepo.saveState(state);
    const bufferedMessages = await this.debouncerService?.cancelPending(cleanPhone);
    await this.persistBufferedCustomerMessages(cleanPhone, bufferedMessages || [], now);
    return pauseUntil;
  }

  private async persistBufferedCustomerMessages(
    customerPhone: string,
    messages: string[],
    timestamp: Date
  ): Promise<void> {
    for (const content of messages) {
      if (!content.trim()) continue;
      await this.conversationRepo.addMessage(customerPhone, {
        role: 'user',
        content,
        timestamp
      });
    }
  }

  public async resumeConversation(customerPhone: string): Promise<void> {
    const cleanPhone = normalizeContactIdentity(customerPhone);
    const state = await this.conversationRepo.getState(cleanPhone);
    state.coexistenceStatus = 'BOT_ACTIVE';
    state.humanPauseUntil = undefined;
    state.botPausedIndefinitely = false;
    state.updatedAt = new Date();
    await this.conversationRepo.saveState(state);
  }

  /**
   * Evalúa si el bot tiene autorización para responder a un mensaje entrante del cliente.
   * Aplica la ventana configurable de silencio tras intervención humana y verificación de comandos.
   */
  public async evaluateAccess(customerPhone: string, incomingText?: string): Promise<CoexistenceDecision> {
    const cleanPhone = normalizeContactIdentity(customerPhone);
    const userText = incomingText?.trim() || '';

    // 1. Revisar comandos directos
    if (userText.toLowerCase() === '!bot on' || userText.toLowerCase() === '!bot off') {
      const handled = await this.handleCommand(cleanPhone, userText);
      const state = await this.conversationRepo.getState(cleanPhone);
      return {
        canRespond: false, // Los comandos se consumen internamente
        status: state.coexistenceStatus || 'BOT_ACTIVE',
        reason: `Comando ${userText} ejecutado`,
        isCommandHandled: handled
      };
    }

    const state = await this.conversationRepo.getState(cleanPhone);
    const currentStatus = state.coexistenceStatus || 'BOT_ACTIVE';

    // 2. Si el bot fue apagado indefinidamente (!bot off)
    if (state.botPausedIndefinitely) {
      return {
        canRespond: false,
        status: 'HUMAN_TAKE-OVER',
        reason: 'Bot pausado indefinidamente por operador humano (!bot off)'
      };
    }

    // 3. Si está en estado HUMAN_TAKE-OVER, verificar la ventana de cooldown.
    if (currentStatus === 'HUMAN_TAKE-OVER') {
      const lastInteraction = state.lastHumanInteraction ? new Date(state.lastHumanInteraction).getTime() : 0;
      const now = Date.now();
      const minutesSinceHuman = (now - lastInteraction) / 60000;
      const pauseUntil = state.humanPauseUntil ? new Date(state.humanPauseUntil).getTime() : undefined;
      const isPaused = pauseUntil !== undefined ? now < pauseUntil : minutesSinceHuman < this.cooldownMinutes;

      if (isPaused) {
        const remainingMinutes = pauseUntil !== undefined ? Math.max(0, (pauseUntil - now) / 60000) : this.cooldownMinutes - minutesSinceHuman;
        return {
          canRespond: false,
          status: 'HUMAN_TAKE-OVER',
          reason: `Operador humano atendiendo. Pausa activa (${remainingMinutes.toFixed(1)} min restantes)`
        };
      }

      // La ventana expiró -> Reactivar automáticamente el bot.
      state.coexistenceStatus = 'BOT_ACTIVE';
      state.humanPauseUntil = undefined;
      state.updatedAt = new Date();
      await this.conversationRepo.saveState(state);

      return {
        canRespond: true,
        status: 'BOT_ACTIVE',
        reason: 'Cooldown expirado. Bot reactivado automáticamente.'
      };
    }

    // 4. Estado por defecto: BOT_ACTIVE
    return {
      canRespond: true,
      status: 'BOT_ACTIVE'
    };
  }
}
