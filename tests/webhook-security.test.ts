import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';
import { WhatsAppWebhookController } from '../src/presentation/controllers/WhatsAppWebhookController.js';
import { IdempotencyService } from '../src/application/services/IdempotencyService.js';
import { RedisService } from '../src/infrastructure/cache/RedisService.js';

type MockResponse = {
  status: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
};

function response(): MockResponse {
  const result = {
    status: vi.fn(),
    send: vi.fn()
  } as MockResponse;
  result.status.mockReturnValue(result);
  return result;
}

function request(body: unknown, signature?: string): any {
  return {
    body,
    rawBody: Buffer.from(JSON.stringify(body)),
    get: (name: string) => name.toLowerCase() === 'x-hub-signature-256' ? signature : undefined,
    query: {}
  };
}

function metaMessage(messageId = 'wamid.security-1') {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'business-account-id',
      changes: [{
        field: 'messages',
        value: {
          metadata: { phone_number_id: 'phone-number-id' },
          messages: [{ id: messageId, from: '573001234567', type: 'text', text: { body: 'Hola' } }]
        }
      }]
    }]
  };
}

describe('seguridad del webhook Meta', () => {
  const security = {
    provider: 'cloud_api' as const,
    appSecret: 'test-app-secret',
    verifyToken: 'test-verify-token'
  };
  const signatureFor = (body: unknown) => {
    const rawBody = Buffer.from(JSON.stringify(body));
    return `sha256=${crypto.createHmac('sha256', security.appSecret).update(rawBody).digest('hex')}`;
  };

  it('acepta una firma válida y procesa el payload Meta', async () => {
    const useCase = { execute: vi.fn().mockResolvedValue(undefined) } as any;
    const controller = new WhatsAppWebhookController(useCase, undefined, undefined, undefined, undefined, undefined, undefined, security);
    const body = metaMessage();
    const rawBody = Buffer.from(JSON.stringify(body));
    const signature = signatureFor(body);
    const res = response();

    await controller.handleWebhook({ ...request(body, signature), rawBody }, res as any);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith('EVENT_RECEIVED');
    expect(useCase.execute).toHaveBeenCalledWith({
      from: '573001234567',
      text: 'Hola',
      imageUrl: undefined,
      messageId: 'wamid.security-1'
    });
  });

  it('rechaza una firma inválida antes de validar o procesar el evento', async () => {
    const useCase = { execute: vi.fn() } as any;
    const controller = new WhatsAppWebhookController(useCase, undefined, undefined, undefined, undefined, undefined, undefined, security);
    const res = response();

    await controller.handleWebhook(request(metaMessage(), 'sha256=invalid'), res as any);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(useCase.execute).not.toHaveBeenCalled();
  });

  it('rechaza la verificación GET cuando el token configurado está vacío', () => {
    const controller = new WhatsAppWebhookController(
      { execute: vi.fn() } as any,
      undefined, undefined, undefined, undefined, undefined, undefined,
      { ...security, verifyToken: '' }
    );
    const res = response();
    const req = { query: { 'hub.mode': 'subscribe', 'hub.verify_token': '', 'hub.challenge': 'challenge' } } as any;

    controller.verify(req, res as any);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith('Token de verificación inválido');
  });

  it('rechaza un payload Meta inválido con 400', async () => {
    const controller = new WhatsAppWebhookController(
      { execute: vi.fn() } as any,
      undefined, undefined, undefined, undefined, undefined, undefined, security
    );
    const body = { object: 'whatsapp_business_account', entry: [] };
    const rawBody = Buffer.from(JSON.stringify(body));
    const signature = signatureFor(body);
    const res = response();

    await controller.handleWebhook({ ...request(body, signature), rawBody }, res as any);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith('Payload de WhatsApp inválido');
  });

  it('ignora un replay mediante idempotencia sin depender de Redis', async () => {
    const useCase = { execute: vi.fn().mockResolvedValue(undefined) } as any;
    const cache = new RedisService();
    const idempotency = new IdempotencyService(cache);
    const controller = new WhatsAppWebhookController(useCase, undefined, idempotency, undefined, undefined, undefined, undefined, security);
    const body = metaMessage('wamid.replay');
    const rawBody = Buffer.from(JSON.stringify(body));
    const signature = signatureFor(body);
    const first = response();
    const second = response();

    await controller.handleWebhook({ ...request(body, signature), rawBody }, first as any);
    await controller.handleWebhook({ ...request(body, signature), rawBody }, second as any);

    expect(useCase.execute).toHaveBeenCalledTimes(1);
    await cache.close();
  });

  it('mantiene el simulador sin exigir firma Meta', async () => {
    const useCase = { execute: vi.fn().mockResolvedValue(undefined) } as any;
    const controller = new WhatsAppWebhookController(useCase, undefined, undefined, undefined, undefined, undefined, undefined, {
      provider: 'simulator', appSecret: '', verifyToken: ''
    });
    const res = response();

    await controller.handleWebhook(request({ from: '573001234567', text: 'Hola' }), res as any);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(useCase.execute).toHaveBeenCalled();
  });

  it('registra un mensaje solo una vez bajo llamadas concurrentes', async () => {
    const cache = new RedisService();
    const idempotency = new IdempotencyService(cache);
    const results = await Promise.all(Array.from({ length: 20 }, () => idempotency.markIfNew('concurrent-id')));
    expect(results.filter(Boolean)).toHaveLength(1);
    await cache.close();
  });
});
