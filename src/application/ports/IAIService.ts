import { ChatMessage } from '../../domain/repositories/IConversationRepository.js';

export interface ToolCallResult {
  toolName: string;
  args: any;
  result: any;
}

export interface AIResponse {
  message: string;
  toolCalls?: ToolCallResult[];
}

export interface IAIService {
  /**
   * Procesa la conversación del cliente invocando el LLM con Tool Calling y el System Prompt.
   */
  generateReply(
    history: ChatMessage[],
    userMessage: string,
    imageUrl?: string
  ): Promise<AIResponse>;
}
