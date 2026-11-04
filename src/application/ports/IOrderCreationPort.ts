import { Order } from '../../domain/entities/Order.js';
import type { PanelOrderPayload } from './IPanelOrderNotifier.js';

/** Persists a new order and its panel event in the same database transaction. */
export interface IOrderCreationPort {
  saveOrderAndEnqueue(order: Order, payload: PanelOrderPayload): Promise<void>;
}
