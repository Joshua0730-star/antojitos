import type { IOrderOutbox, OrderOutboxEntry } from '../ports/IOrderOutbox.js';

export interface OrderOutboxPublisher<TPayload = unknown> {
  publish(entry: OrderOutboxEntry<TPayload>): Promise<void>;
}

export interface OrderOutboxDispatcherOptions {
  batchSize?: number;
  maxAttempts?: number;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
  leaseMs?: number;
  now?: () => Date;
}

export interface OrderOutboxDispatchResult {
  claimed: number;
  sent: number;
  retried: number;
  dead: number;
}

export class OrderOutboxDispatcher<TPayload = unknown> {
  private readonly batchSize: number;
  private readonly maxAttempts: number;
  private readonly retryBaseDelayMs: number;
  private readonly retryMaxDelayMs: number;
  private readonly leaseMs: number;
  private readonly now: () => Date;

  constructor(
    private readonly outbox: IOrderOutbox<TPayload>,
    private readonly publisher: OrderOutboxPublisher<TPayload>,
    options: OrderOutboxDispatcherOptions = {}
  ) {
    this.batchSize = options.batchSize ?? 25;
    this.maxAttempts = options.maxAttempts ?? 5;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 1_000;
    this.retryMaxDelayMs = options.retryMaxDelayMs ?? 60_000;
    this.leaseMs = options.leaseMs ?? 60_000;
    this.now = options.now ?? (() => new Date());
    if (this.batchSize < 1 || this.maxAttempts < 1 || this.retryBaseDelayMs < 0 || this.retryMaxDelayMs < 0 || this.leaseMs < 1) {
      throw new Error('Configuración inválida del dispatcher de outbox');
    }
  }

  async dispatchOnce(): Promise<OrderOutboxDispatchResult> {
    const claimed = await this.outbox.claimBatch(this.batchSize, this.now(), this.leaseMs);
    const result: OrderOutboxDispatchResult = { claimed: claimed.length, sent: 0, retried: 0, dead: 0 };

    for (const entry of claimed) {
      try {
        await this.publisher.publish(entry);
        await this.outbox.markSent(entry.id, this.now());
        result.sent += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (entry.attempts >= this.maxAttempts) {
          await this.outbox.markDead(entry.id, message);
          result.dead += 1;
        } else {
          await this.outbox.markRetry(entry.id, this.nextAttemptAt(entry.attempts), message);
          result.retried += 1;
        }
      }
    }
    return result;
  }

  private nextAttemptAt(attempt: number): Date {
    const delay = Math.min(this.retryMaxDelayMs, this.retryBaseDelayMs * (2 ** Math.max(0, attempt - 1)));
    return new Date(this.now().getTime() + delay);
  }
}
