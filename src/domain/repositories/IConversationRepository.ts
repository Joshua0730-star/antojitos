export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  imageUrl?: string;
  timestamp: Date;
}

export interface ConversationState {
  phoneNumber: string;
  messages: ChatMessage[];
  currentStep: number; // 1 a 6 según especificación
  currentOrderId?: string;
  updatedAt: Date;
}

export interface IConversationRepository {
  getState(phoneNumber: string): Promise<ConversationState>;
  saveState(state: ConversationState): Promise<void>;
  addMessage(phoneNumber: string, message: ChatMessage): Promise<void>;
  clearConversation(phoneNumber: string): Promise<void>;
}
