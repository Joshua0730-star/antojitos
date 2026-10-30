export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
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
  updatedAt: Date;
}

export interface IConversationRepository {
  getState(phoneNumber: string): Promise<ConversationState>;
  saveState(state: ConversationState): Promise<void>;
  addMessage(phoneNumber: string, message: ChatMessage): Promise<void>;
  clearConversation(phoneNumber: string): Promise<void>;
}
