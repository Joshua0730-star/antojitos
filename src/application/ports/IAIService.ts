import { ChatMessage } from '../../domain/repositories/IConversationRepository.js';

export type AIErrorKind =
  | 'timeout'
  | 'rate_limit'
  | 'provider'
  | 'network'
  | 'authentication'
  | 'invalid_request'
  | 'unknown';

export class AIServiceError extends Error {
  public readonly name = 'AIServiceError';

  constructor(
    message: string,
    public readonly kind: AIErrorKind,
    public readonly retryable: boolean,
    public readonly status?: number,
    options?: ErrorOptions
  ) {
    super(message, options);
  }
}

export function classifyAIError(error: unknown): AIServiceError {
  if (error instanceof AIServiceError) return error;

  const candidate = error as { message?: unknown; name?: unknown; status?: unknown; code?: unknown } | null;
  const message = String(candidate?.message || error || 'Error desconocido del proveedor de IA');
  const name = String(candidate?.name || '').toLowerCase();
  const code = String(candidate?.code || '').toLowerCase();
  const status = typeof candidate?.status === 'number' ? candidate.status : undefined;

  if (name.includes('timeout') || code.includes('timeout') || /timeout|timed out|aborted/i.test(message)) {
    return new AIServiceError(message, 'timeout', true, status, { cause: error });
  }
  if (status === 429 || /rate.?limit|too many requests|quota/i.test(message)) {
    return new AIServiceError(message, 'rate_limit', true, status, { cause: error });
  }
  if (status === 401 || status === 403 || /invalid api key|incorrect api key|authentication|unauthorized|forbidden/i.test(message)) {
    return new AIServiceError(message, 'authentication', false, status, { cause: error });
  }
  if (status !== undefined && status >= 400 && status < 500) {
    return new AIServiceError(message, 'invalid_request', false, status, { cause: error });
  }
  if (status !== undefined && status >= 500) {
    return new AIServiceError(message, 'provider', true, status, { cause: error });
  }
  if (/network|fetch failed|socket|econn|connection|dns/i.test(`${name} ${code} ${message}`)) {
    return new AIServiceError(message, 'network', true, status, { cause: error });
  }
  return new AIServiceError(message, 'unknown', false, status, { cause: error });
}

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
    imageUrl?: string,
    requestId?: string
  ): Promise<AIResponse>;
}
