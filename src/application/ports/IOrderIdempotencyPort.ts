import { Order } from '../../domain/entities/Order.js';

export interface IdempotentOrderResult {
  created: boolean;
  order: Order;
}

/** Persists a confirmed order exactly once for an inbound message identity. */
export interface IOrderIdempotencyPort {
  saveOrderIdempotently(order: Order, idempotencyKey: string): Promise<IdempotentOrderResult>;
}
