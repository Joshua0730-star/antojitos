import type { OrderSession } from '../fsm/orderFsm.js';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  /** Identifica quién originó el mensaje; role se conserva por compatibilidad. */
  author?: 'customer' | 'bot' | 'human' | 'system';
  source?: 'whatsapp_customer' | 'bot_api' | 'human_mobile' | 'system';
  messageId?: string;
  content: string;
  imageUrl?: string;
  timestamp: Date;
}

export type CoexistenceStatus = 'BOT_ACTIVE' | 'HUMAN_TAKE-OVER' | 'COOLDOWN';

export interface ConversationState {
  phoneNumber: string;
  messages: ChatMessage[];
  currentStep: number; // 1 a 6 según especificación
  currentOrderId?: string;
  coexistenceStatus?: CoexistenceStatus;
  lastHumanInteraction?: Date;
  humanTakeoverStartedAt?: Date;
  humanPauseUntil?: Date;
  botPausedIndefinitely?: boolean;
  fsmSession?: OrderSession;
  updatedAt: Date;
}

export interface IConversationRepository {
  getState(phoneNumber: string): Promise<ConversationState>;
  saveState(state: ConversationState): Promise<void>;
  addMessage(phoneNumber: string, message: ChatMessage): Promise<void>;
  clearConversation(phoneNumber: string): Promise<void>;
}
