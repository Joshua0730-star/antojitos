export type OrderOutboxStatus = 'pending' | 'processing' | 'sent' | 'dead';

export interface OrderOutboxEntry<TPayload = unknown> {
  id: string;
  orderId: string;
  payload: TPayload;
  status: OrderOutboxStatus;
  attempts: number;
  nextAttemptAt: Date;
  lastError?: string;
  lockedAt?: Date;
  createdAt: Date;
  sentAt?: Date;
}

export interface IOrderOutbox<TPayload = unknown> {
  enqueue(orderId: string, payload: TPayload, nextAttemptAt?: Date): Promise<OrderOutboxEntry<TPayload>>;
  claimBatch(limit: number, now?: Date, leaseMs?: number): Promise<Array<OrderOutboxEntry<TPayload>>>;
  markSent(id: string, sentAt?: Date): Promise<void>;
  markRetry(id: string, nextAttemptAt: Date, error: string): Promise<void>;
  markDead(id: string, error: string): Promise<void>;
}
