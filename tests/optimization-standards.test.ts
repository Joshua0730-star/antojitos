import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RedisService } from '../src/infrastructure/cache/RedisService.js';
import { IdempotencyService } from '../src/application/services/IdempotencyService.js';
import { ContextOptimizerService } from '../src/application/services/ContextOptimizerService.js';
import { MessageDebouncerService } from '../src/application/services/MessageDebouncerService.js';
import { ProcessIncomingMessageUseCase } from '../src/application/use-cases/ProcessIncomingMessageUseCase.js';
import { ChatMessage } from '../src/domain/repositories/IConversationRepository.js';

describe('Production Chatbot Optimization Standards', () => {
  let cacheService: RedisService;
  let idempotencyService: IdempotencyService;
  let contextOptimizer: ContextOptimizerService;

  beforeEach(() => {
    cacheService = new RedisService();
    idempotencyService = new IdempotencyService(cacheService);
    contextOptimizer = new ContextOptimizerService(5);
  });

  describe('Idempotency Service (Deduplication)', () => {
    it('permite el primer mensaje y bloquea duplicados con el mismo wamid', async () => {
      const messageId = 'wamid.HBgLMzg3MjgxOTA3NxUCMRIA';

      const firstAttempt = await idempotencyService.markIfNew(messageId);
      expect(firstAttempt).toBe(true);

      const secondAttempt = await idempotencyService.markIfNew(messageId);
      expect(secondAttempt).toBe(false);

      const thirdAttempt = await idempotencyService.markIfNew(messageId);
      expect(thirdAttempt).toBe(false);
    });

    it('permite mensajes distintos con IDs diferentes', async () => {
      expect(await idempotencyService.markIfNew('msg_1')).toBe(true);
      expect(await idempotencyService.markIfNew('msg_2')).toBe(true);
      expect(await idempotencyService.markIfNew('msg_1')).toBe(false);
    });
  });

  describe('Context Optimizer Service (Sliding Window)', () => {
    it('mantiene la ventana deslizante máxima sin exceder el límite de tokens', () => {
      const history: ChatMessage[] = [
        { role: 'user', content: 'Mensaje 1', timestamp: new Date() },
        { role: 'assistant', content: 'Respuesta 1', timestamp: new Date() },
        { role: 'user', content: 'Mensaje 2', timestamp: new Date() },
        { role: 'assistant', content: 'Respuesta 2', timestamp: new Date() },
        { role: 'user', content: 'Mensaje 3', timestamp: new Date() },
        { role: 'assistant', content: 'Respuesta 3', timestamp: new Date() },
        { role: 'user', content: 'Mensaje 4', timestamp: new Date() },
        { role: 'assistant', content: 'Respuesta 4', timestamp: new Date() }
      ];

      const optimized = contextOptimizer.optimizeHistory(history);
      expect(optimized.length).toBe(5);
      expect(optimized[optimized.length - 1].content).toBe('Respuesta 4');
      expect(optimized[0].content).toBe('Respuesta 2');
    });

    it('no modifica historiales pequeños que están por debajo del límite', () => {
      const smallHistory: ChatMessage[] = [
        { role: 'user', content: 'Hola', timestamp: new Date() },
        { role: 'assistant', content: '¡Hola! Bienvenido.', timestamp: new Date() }
      ];

      const optimized = contextOptimizer.optimizeHistory(smallHistory);
      expect(optimized.length).toBe(2);
    });

    it('limita el periodo humano y prioriza sus acuerdos recientes', () => {
      const takeoverStartedAt = new Date('2026-10-31T10:00:00.000Z');
      const history: ChatMessage[] = Array.from({ length: 8 }, (_, index) => ({
        role: index % 2 === 0 ? 'user' : 'assistant',
        content: index < 4 ? `previo-${index}` : `humano-${index}`,
        timestamp: new Date(`2026-10-31T${index < 4 ? '09' : '10'}:${String(index).padStart(2, '0')}:00.000Z`)
      }));

      const optimized = new ContextOptimizerService(4).optimizeHistory(history, takeoverStartedAt);

      expect(optimized).toHaveLength(4);
      expect(optimized.map(message => message.content)).toEqual([
        'humano-4', 'humano-5', 'humano-6', 'humano-7'
      ]);
    });
  });

  describe('Message Debouncer & Burst Batching', () => {
    it('agrupa múltiples mensajes en ráfaga en una sola llamada de IA', async () => {
      const mockUseCase = {
        execute: vi.fn().mockResolvedValue({
          replied: true,
          replyMessage: 'Respuesta combinada',
          isCallRejection: false
        })
      } as unknown as ProcessIncomingMessageUseCase;

      const debouncer = new MessageDebouncerService(cacheService, mockUseCase, 100);
      const phone = '+573009998877';

      // El usuario escribe 3 mensajes seguidos en WhatsApp
      await debouncer.enqueueMessage({ from: phone, text: 'Hola buenas tardes' });
      await debouncer.enqueueMessage({ from: phone, text: 'Quería saber si tienen fresas con crema' });
      await debouncer.enqueueMessage({ from: phone, text: 'y a qué precio las tienen' });

      // Esperar que transcurra el tiempo de debounce
      await new Promise(r => setTimeout(r, 180));

      expect(mockUseCase.execute).toHaveBeenCalledTimes(1);
      expect(mockUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          from: phone,
          text: 'Hola buenas tardes\nQuería saber si tienen fresas con crema\ny a qué precio las tienen'
        })
      );
    });

    it('procesa de inmediato cuando se recibe una llamada o una imagen de comprobante', async () => {
      const mockUseCase = {
        execute: vi.fn().mockResolvedValue({
          replied: true,
          replyMessage: 'Comprobante recibido',
          isCallRejection: false
        })
      } as unknown as ProcessIncomingMessageUseCase;

      const debouncer = new MessageDebouncerService(cacheService, mockUseCase, 500);
      const phone = '+573001112233';

      await debouncer.enqueueMessage({
        from: phone,
        text: 'Aquí está mi pago Nequi',
        imageUrl: 'data:image/jpeg;base64,mock...'
      });

      // Debe ejecutarse inmediatamente sin esperar el timeout
      expect(mockUseCase.execute).toHaveBeenCalledTimes(1);
      expect(mockUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          from: phone,
          text: 'Aquí está mi pago Nequi',
          imageUrl: 'data:image/jpeg;base64,mock...'
        })
      );
    });

    it('recupera un buffer pendiente cuando la réplica original pierde su temporizador local', async () => {
      const mockUseCase = {
        execute: vi.fn().mockResolvedValue({ replied: true, replyMessage: 'Recuperado', isCallRejection: false })
      } as unknown as ProcessIncomingMessageUseCase;
      const firstReplica = new MessageDebouncerService(cacheService, mockUseCase, 100);
      const secondReplica = new MessageDebouncerService(cacheService, mockUseCase, 100);
      const phone = '+573008887766';

      await firstReplica.enqueueMessage({ from: phone, text: 'Mensaje pendiente tras reinicio' });
      for (const timer of (firstReplica as unknown as { timers: Map<string, NodeJS.Timeout> }).timers.values()) clearTimeout(timer);
      (firstReplica as unknown as { timers: Map<string, NodeJS.Timeout> }).timers.clear();

      await new Promise(resolve => setTimeout(resolve, 450));
      expect(mockUseCase.execute).toHaveBeenCalledTimes(1);
      expect(mockUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({ from: phone, text: 'Mensaje pendiente tras reinicio' }));
      void secondReplica;
    });
  });
});
