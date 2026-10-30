import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CoexistenceService } from '../src/application/services/CoexistenceService.js';
import { FileConversationRepository } from '../src/infrastructure/persistence/FileConversationRepository.js';
import { MessageDebouncerService } from '../src/application/services/MessageDebouncerService.js';
import { RedisService } from '../src/infrastructure/cache/RedisService.js';
import { ProcessIncomingMessageUseCase } from '../src/application/use-cases/ProcessIncomingMessageUseCase.js';
import { WhatsAppWebhookController } from '../src/presentation/controllers/WhatsAppWebhookController.js';
import { IWhatsAppService } from '../src/application/ports/IWhatsAppService.js';
import { IAIService } from '../src/application/ports/IAIService.js';
import fs from 'fs';

describe('Meta WhatsApp Coexistence & Human Handoff (WhatsApp Cloud API + Mobile App)', () => {
  const testDir = './data/test_coexistence';
  let conversationRepo: FileConversationRepository;
  let cacheService: RedisService;
  let coexistenceService: CoexistenceService;
  let mockDebouncer: MessageDebouncerService;

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    conversationRepo = new FileConversationRepository(testDir);
    cacheService = new RedisService();
    mockDebouncer = new MessageDebouncerService(
      cacheService,
      { execute: vi.fn() } as unknown as ProcessIncomingMessageUseCase
    );
    coexistenceService = new CoexistenceService(conversationRepo, mockDebouncer, 15);
  });

  it('inicia en estado BOT_ACTIVE por defecto y permite responder', async () => {
    const customer = '+573001112233';
    const decision = await coexistenceService.evaluateAccess(customer, 'Hola');
    expect(decision.canRespond).toBe(true);
    expect(decision.status).toBe('BOT_ACTIVE');
  });

  it('registra un Echo humano, cambia a HUMAN_TAKE-OVER y silencia el bot durante los 15 minutos', async () => {
    const customer = '+573001112233';
    const cancelSpy = vi.spyOn(mockDebouncer, 'cancelPending');

    // El humano responde desde la app de WhatsApp Business
    await coexistenceService.registerHumanEcho(customer, 'Te atiendo personalmente y ya reviso tu pedido.');

    expect(cancelSpy).toHaveBeenCalledWith('573001112233');

    const state = await conversationRepo.getState('573001112233');
    expect(state.coexistenceStatus).toBe('HUMAN_TAKE-OVER');
    expect(state.lastHumanInteraction).toBeDefined();
    expect(state.messages.at(-1)?.role).toBe('assistant');
    expect(state.messages.at(-1)?.content).toContain('Te atiendo personalmente');

    // El cliente envía un mensaje 2 minutos después
    const decision = await coexistenceService.evaluateAccess(customer, 'Hola sigues ahí?');
    expect(decision.canRespond).toBe(false);
    expect(decision.status).toBe('HUMAN_TAKE-OVER');
    expect(decision.reason).toContain('Operador humano atendiendo');
  });

  it('reactiva automáticamente el bot tras expirar el período de 15 minutos de inactividad humana', async () => {
    const customer = '+573001112233';
    await coexistenceService.registerHumanEcho(customer);

    // Simulamos que pasaron 16 minutos desde la última respuesta humana
    const state = await conversationRepo.getState('573001112233');
    const sixteenMinutesAgo = new Date(Date.now() - 16 * 60 * 1000);
    state.lastHumanInteraction = sixteenMinutesAgo;
    await conversationRepo.saveState(state);

    // El cliente escribe de nuevo
    const decision = await coexistenceService.evaluateAccess(customer, 'Buenas, me confirmas mi pedido?');
    expect(decision.canRespond).toBe(true);
    expect(decision.status).toBe('BOT_ACTIVE');

    const updatedState = await conversationRepo.getState('573001112233');
    expect(updatedState.coexistenceStatus).toBe('BOT_ACTIVE');
  });

  it('permite pausar el bot indefinidamente con !bot off y reactivarlo con !bot on', async () => {
    const customer = '+573005556677';

    // 1. Operador escribe !bot off
    const turnOffResult = await coexistenceService.evaluateAccess(customer, '!bot off');
    expect(turnOffResult.canRespond).toBe(false);
    expect(turnOffResult.isCommandHandled).toBe(true);

    const statePaused = await conversationRepo.getState('573005556677');
    expect(statePaused.botPausedIndefinitely).toBe(true);

    // El cliente escribe aún después de 1 hora
    const decisionWhileOff = await coexistenceService.evaluateAccess(customer, 'Hola');
    expect(decisionWhileOff.canRespond).toBe(false);

    // 2. Operador escribe !bot on
    const turnOnResult = await coexistenceService.evaluateAccess(customer, '!bot on');
    expect(turnOnResult.isCommandHandled).toBe(true);

    const stateResumed = await conversationRepo.getState('573005556677');
    expect(stateResumed.botPausedIndefinitely).toBe(false);
    expect(stateResumed.coexistenceStatus).toBe('BOT_ACTIVE');

    // Ahora el cliente escribe y el bot responde
    const decisionAfterOn = await coexistenceService.evaluateAccess(customer, 'Hola quiero pedir');
    expect(decisionAfterOn.canRespond).toBe(true);
    expect(decisionAfterOn.status).toBe('BOT_ACTIVE');
  });

  it('permite configurar la duración de la pausa por conversación', async () => {
    const customer = '+573008887766';
    const pauseUntil = await coexistenceService.pauseConversation(customer, 10);
    const state = await conversationRepo.getState('573008887766');

    expect(state.coexistenceStatus).toBe('HUMAN_TAKE-OVER');
    expect(state.humanPauseUntil?.getTime()).toBe(pauseUntil.getTime());
    expect(pauseUntil.getTime() - Date.now()).toBeGreaterThan(9 * 60 * 1000);
    expect(pauseUntil.getTime() - Date.now()).toBeLessThanOrEqual(10 * 60 * 1000);
  });

  it('maneja el flujo completo en WhatsAppWebhookController ante smb_message_echoes de Meta', async () => {
    const mockWhatsAppService: IWhatsAppService = {
      sendMessage: vi.fn().mockResolvedValue(true),
      sendImage: vi.fn().mockResolvedValue(true),
      sendKitchenAlert: vi.fn().mockResolvedValue(true),
      getMediaDataUrl: vi.fn().mockResolvedValue(''),
      markAsRead: vi.fn().mockResolvedValue(true)
    };

    const mockAiService: IAIService = {
      generateReply: vi.fn().mockResolvedValue({ message: 'Respuesta del bot' })
    };

    const useCase = new ProcessIncomingMessageUseCase(
      mockAiService,
      mockWhatsAppService,
      conversationRepo,
      undefined,
      coexistenceService
    );

    const controller = new WhatsAppWebhookController(
      useCase,
      mockWhatsAppService,
      undefined,
      mockDebouncer,
      coexistenceService
    );

    const res = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn()
    } as any;

    // 1. Meta envía webhook de Echo (el operador humano atendió al cliente desde la app móvil)
    const echoWebhookReq = {
      body: {
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                field: 'smb_message_echoes',
                value: {
                  messages: [
                    {
                      from: '573009990000',
                      to: '573004443322',
                      text: { body: 'Hola, ya te estamos preparando tu pedido' }
                    }
                  ]
                }
              }
            ]
          }
        ]
      }
    } as any;

    await controller.handleWebhook(echoWebhookReq, res);

    const state = await conversationRepo.getState('573004443322');
    expect(state.coexistenceStatus).toBe('HUMAN_TAKE-OVER');

    // 2. Cliente responde inmediatamente. El bot debe permanecer en silencio (sin llamar a la IA ni enviar mensaje)
    const clientMessageReq = {
      body: {
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                field: 'messages',
                value: {
                  messages: [
                    {
                      id: 'wamid.123',
                      from: '573004443322',
                      type: 'text',
                      text: { body: '¡Muchas gracias por la atención!' }
                    }
                  ]
                }
              }
            ]
          }
        ]
      }
    } as any;

    await controller.handleWebhook(clientMessageReq, res);

    expect(mockAiService.generateReply).not.toHaveBeenCalled();
    expect(mockWhatsAppService.sendMessage).not.toHaveBeenCalled();

    const accumulated = await conversationRepo.getState('573004443322');
    expect(accumulated.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'assistant', content: 'Hola, ya te estamos preparando tu pedido' }),
      expect.objectContaining({ role: 'user', content: '¡Muchas gracias por la atención!' })
    ]));
  });

  it('conserva el identificador LID cuando WhatsApp no entrega teléfono', async () => {
    const mockWhatsAppService: IWhatsAppService = {
      sendMessage: vi.fn().mockResolvedValue(true),
      sendImage: vi.fn().mockResolvedValue(true),
      sendKitchenAlert: vi.fn().mockResolvedValue(true),
      getMediaDataUrl: vi.fn().mockResolvedValue(''),
      markAsRead: vi.fn().mockResolvedValue(true)
    };
    const useCase = new ProcessIncomingMessageUseCase(
      { generateReply: vi.fn() } as unknown as IAIService,
      mockWhatsAppService,
      conversationRepo,
      undefined,
      coexistenceService
    );
    const controller = new WhatsAppWebhookController(
      useCase,
      mockWhatsAppService,
      undefined,
      mockDebouncer,
      coexistenceService
    );
    const enqueueSpy = vi.spyOn(mockDebouncer, 'enqueueMessage');
    const res = { status: vi.fn().mockReturnThis(), send: vi.fn() } as any;

    await controller.handleWebhook({
      body: {
        event: 'messages.upsert',
        data: {
          key: { id: 'lid-message-1', remoteJid: 'usuario_antojos@lid', fromMe: false },
          message: { conversation: 'Hola, quiero conocer el menú' }
        }
      }
    } as any, res);

    expect(enqueueSpy).toHaveBeenCalledWith(expect.objectContaining({
      from: 'usuario_antojos@lid',
      text: 'Hola, quiero conocer el menú',
      messageId: 'lid-message-1'
    }));
    expect(String(enqueueSpy.mock.calls[0]?.[0].from)).not.toMatch(/^\d+$/);
  });

  it('silencia la conversación cuando Evolution informa una respuesta humana desde móvil', async () => {
    const mockWhatsAppService: IWhatsAppService = {
      sendMessage: vi.fn().mockResolvedValue(true),
      sendImage: vi.fn().mockResolvedValue(true),
      sendKitchenAlert: vi.fn().mockResolvedValue(true),
      getMediaDataUrl: vi.fn().mockResolvedValue(''),
      markAsRead: vi.fn().mockResolvedValue(true)
    };
    const controller = new WhatsAppWebhookController(
      { execute: vi.fn() } as unknown as ProcessIncomingMessageUseCase,
      mockWhatsAppService,
      undefined,
      mockDebouncer,
      coexistenceService
    );
    const res = { status: vi.fn().mockReturnThis(), send: vi.fn() } as any;

    await controller.handleWebhook({
      body: {
        event: 'messages.upsert',
        data: {
          source: 'android',
          key: { id: 'human-echo-1', remoteJid: '573004443322@s.whatsapp.net', fromMe: true },
          message: { conversation: 'Hola, ya te atiendo personalmente' }
        }
      }
    } as any, res);

    const state = await conversationRepo.getState('573004443322');
    expect(state.coexistenceStatus).toBe('HUMAN_TAKE-OVER');
  });

  it('responde a un usuario identificado solo por LID', async () => {
    const mockWhatsAppService: IWhatsAppService = {
      sendMessage: vi.fn().mockResolvedValue(true),
      sendImage: vi.fn().mockResolvedValue(true),
      sendKitchenAlert: vi.fn().mockResolvedValue(true),
      getMediaDataUrl: vi.fn().mockResolvedValue(''),
      markAsRead: vi.fn().mockResolvedValue(true)
    };
    const useCase = new ProcessIncomingMessageUseCase(
      { generateReply: vi.fn().mockResolvedValue({ message: '¡Hola! ¿Qué deseas pedir?' }) } as unknown as IAIService,
      mockWhatsAppService,
      conversationRepo,
      undefined,
      coexistenceService
    );

    const result = await useCase.execute({
      from: 'usuario_antojos@lid',
      text: 'Hola'
    });

    expect(result.replied).toBe(true);
    expect(mockWhatsAppService.sendMessage).toHaveBeenCalledWith(
      'usuario_antojos@lid',
      expect.any(String)
    );
    const state = await conversationRepo.getState('usuario_antojos@lid');
    expect(state.messages.length).toBeGreaterThan(0);
  });
});
