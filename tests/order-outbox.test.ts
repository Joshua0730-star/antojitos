import { describe, expect, it, vi } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { PostgresOrderOutbox } from '../src/infrastructure/persistence/PostgresOrderOutbox.js';
import { OrderOutboxDispatcher } from '../src/application/services/OrderOutboxDispatcher.js';
import type { OrderOutboxEntry } from '../src/application/ports/IOrderOutbox.js';

const now = new Date('2026-10-30T18:00:00.000Z');

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'outbox-1',
    order_id: 'order-1',
    payload: { orderId: 'order-1', total: 23000 },
    status: 'processing',
    attempts: 1,
    next_attempt_at: now,
    last_error: null,
    locked_at: now,
    created_at: now,
    sent_at: null,
    ...overrides
  };
}

function poolMock(client: Partial<PoolClient>, query = vi.fn()) {
  return { query, connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;
}

function entry(overrides: Partial<OrderOutboxEntry<{ orderId: string }>> = {}): OrderOutboxEntry<{ orderId: string }> {
  return {
    id: 'outbox-1',
    orderId: 'order-1',
    payload: { orderId: 'order-1' },
    status: 'processing',
    attempts: 1,
    nextAttemptAt: now,
    createdAt: now,
    ...overrides
  };
}

describe('PostgresOrderOutbox', () => {
  it('encola de forma idempotente por order_id y devuelve la fila persistida', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [row({ status: 'pending', attempts: 0 })] });
    const outbox = new PostgresOrderOutbox(poolMock({}, query));

    const result = await outbox.enqueue('order-1', { total: 23000 }, now);

    expect(query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (order_id)'), [
      expect.any(String), 'order-1', JSON.stringify({ total: 23000 }), now
    ]);
    expect(result).toMatchObject({ id: 'outbox-1', orderId: 'order-1', status: 'pending', attempts: 0 });
  });

  it('reclama filas con transacción y FOR UPDATE SKIP LOCKED', async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [row()] })
        .mockResolvedValueOnce({}),
      release: vi.fn()
    } satisfies Partial<PoolClient>;
    const outbox = new PostgresOrderOutbox(poolMock(client));

    const result = await outbox.claimBatch(10, now, 60_000);
    const claimSql = client.query.mock.calls[1][0] as string;

    expect(claimSql).toContain('FOR UPDATE SKIP LOCKED');
    expect(claimSql).toContain("status = 'processing'");
    expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(client.query).toHaveBeenNthCalledWith(3, 'COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
    expect(result[0]).toMatchObject({ orderId: 'order-1', attempts: 1, status: 'processing' });
  });

  it('marca sent, retry y dead con actualizaciones protegidas por estado', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const outbox = new PostgresOrderOutbox(poolMock({}, query));

    await outbox.markSent('outbox-1', now);
    await outbox.markRetry('outbox-1', new Date(now.getTime() + 1000), 'panel caído');
    await outbox.markDead('outbox-1', 'payload inválido');

    expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining("status = 'sent'"), ['outbox-1', now]);
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining("status = 'pending'"), [
      'outbox-1', new Date(now.getTime() + 1000), 'panel caído'
    ]);
    expect(query).toHaveBeenNthCalledWith(3, expect.stringContaining("status = 'dead'"), ['outbox-1', 'payload inválido']);
  });
});

describe('OrderOutboxDispatcher', () => {
  it('publica y marca sent cuando el consumidor tiene éxito', async () => {
    const claimed = entry();
    const outbox = {
      claimBatch: vi.fn().mockResolvedValue([claimed]),
      markSent: vi.fn().mockResolvedValue(undefined),
      markRetry: vi.fn(),
      markDead: vi.fn()
    };
    const publisher = { publish: vi.fn().mockResolvedValue(undefined) };
    const dispatcher = new OrderOutboxDispatcher(outbox, publisher, { now: () => now });

    await expect(dispatcher.dispatchOnce()).resolves.toEqual({ claimed: 1, sent: 1, retried: 0, dead: 0 });
    expect(publisher.publish).toHaveBeenCalledWith(claimed);
    expect(outbox.markSent).toHaveBeenCalledWith('outbox-1', now);
  });

  it('programa retry con backoff exponencial y conserva el error', async () => {
    const claimed = entry({ attempts: 2 });
    const outbox = {
      claimBatch: vi.fn().mockResolvedValue([claimed]),
      markSent: vi.fn(),
      markRetry: vi.fn().mockResolvedValue(undefined),
      markDead: vi.fn()
    };
    const dispatcher = new OrderOutboxDispatcher(outbox, {
      publish: vi.fn().mockRejectedValue(new Error('timeout del panel'))
    }, { now: () => now, retryBaseDelayMs: 1000, maxAttempts: 5 });

    await expect(dispatcher.dispatchOnce()).resolves.toEqual({ claimed: 1, sent: 0, retried: 1, dead: 0 });
    expect(outbox.markRetry).toHaveBeenCalledWith(
      'outbox-1', new Date(now.getTime() + 2000), 'timeout del panel'
    );
  });

  it('marca dead al agotar los intentos', async () => {
    const claimed = entry({ attempts: 5 });
    const outbox = {
      claimBatch: vi.fn().mockResolvedValue([claimed]),
      markSent: vi.fn(),
      markRetry: vi.fn(),
      markDead: vi.fn().mockResolvedValue(undefined)
    };
    const dispatcher = new OrderOutboxDispatcher(outbox, {
      publish: vi.fn().mockRejectedValue(new Error('rechazo permanente'))
    }, { now: () => now, maxAttempts: 5 });

    await expect(dispatcher.dispatchOnce()).resolves.toEqual({ claimed: 1, sent: 0, retried: 0, dead: 1 });
    expect(outbox.markDead).toHaveBeenCalledWith('outbox-1', 'rechazo permanente');
    expect(outbox.markRetry).not.toHaveBeenCalled();
  });
});
