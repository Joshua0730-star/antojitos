import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProcessIncomingMessageUseCase } from '../src/application/use-cases/ProcessIncomingMessageUseCase.js';
import type { IAIService } from '../src/application/ports/IAIService.js';
import type { IWhatsAppService } from '../src/application/ports/IWhatsAppService.js';
import type {
  ChatMessage,
  ConversationState,
  IConversationRepository
} from '../src/domain/repositories/IConversationRepository.js';
import type { CoexistenceService } from '../src/application/services/CoexistenceService.js';

class MemoryConversationRepository implements IConversationRepository {
  private readonly states = new Map<string, ConversationState>();

  async getState(phoneNumber: string): Promise<ConversationState> {
    const state = this.states.get(phoneNumber);
    if (!state) {
      return {
        phoneNumber,
        messages: [],
        currentStep: 1,
        coexistenceStatus: 'BOT_ACTIVE',
        updatedAt: new Date()
      };
    }
    return {
      ...state,
      messages: state.messages.map(message => ({ ...message })),
      fsmSession: state.fsmSession ? structuredClone(state.fsmSession) : undefined
    };
  }

  async saveState(state: ConversationState): Promise<void> {
    this.states.set(state.phoneNumber, {
      ...state,
      messages: state.messages.map(message => ({ ...message })),
      fsmSession: state.fsmSession ? structuredClone(state.fsmSession) : undefined
    });
  }

  async addMessage(phoneNumber: string, message: ChatMessage): Promise<void> {
    const state = await this.getState(phoneNumber);
    state.messages.push(message);
    state.updatedAt = new Date();
    await this.saveState(state);
  }

  async clearConversation(phoneNumber: string): Promise<void> {
    this.states.delete(phoneNumber);
  }
}

function whatsappMock(): IWhatsAppService {
  return {
    sendMessage: vi.fn().mockResolvedValue(true),
    sendImage: vi.fn().mockResolvedValue(true),
    sendKitchenAlert: vi.fn().mockResolvedValue(true)
  };
}

describe('integración de FSM determinista en el flujo real', () => {
  afterEach(() => {
    delete process.env.ENABLE_DETERMINISTIC_FSM;
  });

  it('mantiene la FSM persistida, responde directamente y no llama al LLM', async () => {
    process.env.ENABLE_DETERMINISTIC_FSM = 'true';
    const conversationRepo = new MemoryConversationRepository();
    const whatsApp = whatsappMock();
    const aiService: IAIService = { generateReply: vi.fn() };
    const coexistence = {
      evaluateAccess: vi.fn().mockResolvedValue({ canRespond: true, status: 'BOT_ACTIVE' }),
      registerHumanEcho: vi.fn()
    } as unknown as CoexistenceService;
    const useCase = new ProcessIncomingMessageUseCase(
      aiService,
      whatsApp,
      conversationRepo,
      undefined,
      coexistence
    );

    const result = await useCase.execute({ from: '573001112233', text: 'Regálame una de 12' });
    const state = await conversationRepo.getState('573001112233');

    expect(result.replied).toBe(true);
    expect(result.replyMessage).toContain('12 oz');
    expect(state.fsmSession?.state).toBe('CONFIGURING_PRODUCT');
    expect(state.messages.map(message => message.role)).toEqual(['user', 'assistant']);
    expect(aiService.generateReply).not.toHaveBeenCalled();
    expect(whatsApp.sendMessage).toHaveBeenCalledWith('573001112233', result.replyMessage);
  });

  it('activa coexistencia al alcanzar HANDOFF y persiste ambos turnos', async () => {
    process.env.ENABLE_DETERMINISTIC_FSM = 'true';
    const conversationRepo = new MemoryConversationRepository();
    const whatsApp = whatsappMock();
    const coexistence = {
      evaluateAccess: vi.fn().mockResolvedValue({ canRespond: true, status: 'BOT_ACTIVE' }),
      registerHumanEcho: vi.fn().mockResolvedValue(undefined)
    } as unknown as CoexistenceService;
    const useCase = new ProcessIncomingMessageUseCase(
      { generateReply: vi.fn().mockResolvedValue({ message: 'Respuesta de respaldo' }) },
      whatsApp,
      conversationRepo,
      undefined,
      coexistence
    );

    await useCase.execute({ from: '573009998877', text: 'xyz' });
    const result = await useCase.execute({ from: '573009998877', text: 'abc' });
    const state = await conversationRepo.getState('573009998877');

    expect(result.replyMessage).toContain('asesor');
    expect(state.fsmSession?.state).toBe('HANDOFF');
    expect(state.messages).toHaveLength(4);
    expect(coexistence.registerHumanEcho).toHaveBeenCalledWith('573009998877');
  });

  it('deja los mensajes no resueltos al LLM y conserva la sesión FSM', async () => {
    process.env.ENABLE_DETERMINISTIC_FSM = 'true';
    const conversationRepo = new MemoryConversationRepository();
    const whatsApp = whatsappMock();
    const aiService: IAIService = {
      generateReply: vi.fn().mockResolvedValue({ message: 'Respuesta del LLM' })
    };
    const useCase = new ProcessIncomingMessageUseCase(aiService, whatsApp, conversationRepo);

    const result = await useCase.execute({ from: '573004445566', text: 'xyz' });
    const state = await conversationRepo.getState('573004445566');

    expect(result.replyMessage).toBe('Respuesta del LLM');
    expect(aiService.generateReply).toHaveBeenCalledOnce();
    expect(state.fsmSession?.unknownAttempts).toBe(1);
    expect(state.messages.map(message => message.role)).toEqual(['user', 'assistant']);
  });
});
