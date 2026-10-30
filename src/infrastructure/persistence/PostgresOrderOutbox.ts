import crypto from 'node:crypto';
import type { Pool } from 'pg';
import type {
  IOrderOutbox,
  OrderOutboxEntry,
  OrderOutboxStatus
} from '../../application/ports/IOrderOutbox.js';

interface OrderOutboxRow<TPayload> {
  id: string;
  order_id: string;
  payload: TPayload;
  status: OrderOutboxStatus;
  attempts: number;
  next_attempt_at: Date | string;
  last_error: string | null;
  locked_at: Date | string | null;
  created_at: Date | string;
  sent_at: Date | string | null;
}

type Queryable = Pick<Pool, 'query'>;

function toDate(value: Date | string | null | undefined): Date | undefined {
  return value == null ? undefined : value instanceof Date ? value : new Date(value);
}

function mapRow<TPayload>(row: OrderOutboxRow<TPayload>): OrderOutboxEntry<TPayload> {
  return {
    id: row.id,
    orderId: row.order_id,
    payload: row.payload,
    status: row.status,
    attempts: Number(row.attempts),
    nextAttemptAt: toDate(row.next_attempt_at) as Date,
    lastError: row.last_error ?? undefined,
    lockedAt: toDate(row.locked_at),
    createdAt: toDate(row.created_at) as Date,
    sentAt: toDate(row.sent_at)
  };
}

export class PostgresOrderOutbox<TPayload = unknown> implements IOrderOutbox<TPayload> {
  constructor(private readonly db: Pool) {}

  async enqueue(orderId: string, payload: TPayload, nextAttemptAt = new Date()): Promise<OrderOutboxEntry<TPayload>> {
    if (!orderId.trim()) throw new Error('orderId es obligatorio');
    const result = await this.db.query<OrderOutboxRow<TPayload>>(
      `INSERT INTO order_outbox (id, order_id, payload, next_attempt_at)
       VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT (order_id) DO UPDATE
         SET payload = EXCLUDED.payload
       RETURNING id, order_id, payload, status, attempts, next_attempt_at,
                 last_error, locked_at, created_at, sent_at`,
      [crypto.randomUUID(), orderId, JSON.stringify(payload), nextAttemptAt]
    );
    return mapRow(result.rows[0]);
  }

  async claimBatch(limit: number, now = new Date(), leaseMs = 60_000): Promise<Array<OrderOutboxEntry<TPayload>>> {
    if (!Number.isInteger(limit) || limit < 1) throw new Error('limit debe ser un entero mayor que 0');
    if (leaseMs < 1) throw new Error('leaseMs debe ser mayor que 0');

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<OrderOutboxRow<TPayload>>(
        `WITH candidates AS (
           SELECT id
           FROM order_outbox
           WHERE (status = 'pending' AND next_attempt_at <= $1)
              OR (status = 'processing' AND locked_at < $2)
           ORDER BY created_at, id
           FOR UPDATE SKIP LOCKED
           LIMIT $3
         )
         UPDATE order_outbox AS outbox
         SET status = 'processing', attempts = outbox.attempts + 1, locked_at = $1
         FROM candidates
         WHERE outbox.id = candidates.id
         RETURNING outbox.id, outbox.order_id, outbox.payload, outbox.status,
                   outbox.attempts, outbox.next_attempt_at, outbox.last_error,
                   outbox.locked_at, outbox.created_at, outbox.sent_at`,
        [now, new Date(now.getTime() - leaseMs), limit]
      );
      await client.query('COMMIT');
      return result.rows.map(mapRow);
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async markSent(id: string, sentAt = new Date()): Promise<void> {
    await this.db.query(
      `UPDATE order_outbox
       SET status = 'sent', sent_at = $2, locked_at = NULL, last_error = NULL
       WHERE id = $1 AND status = 'processing'`,
      [id, sentAt]
    );
  }

  async markRetry(id: string, nextAttemptAt: Date, error: string): Promise<void> {
    await this.db.query(
      `UPDATE order_outbox
       SET status = 'pending', next_attempt_at = $2, last_error = $3, locked_at = NULL
       WHERE id = $1 AND status = 'processing'`,
      [id, nextAttemptAt, error.slice(0, 2_000)]
    );
  }

  async markDead(id: string, error: string): Promise<void> {
    await this.db.query(
      `UPDATE order_outbox
       SET status = 'dead', last_error = $2, locked_at = NULL
       WHERE id = $1 AND status = 'processing'`,
      [id, error.slice(0, 2_000)]
    );
  }
}
