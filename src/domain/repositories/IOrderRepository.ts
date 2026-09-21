import { Order } from '../entities/Order.js';

export interface IOrderRepository {
  save(order: Order): Promise<void>;
  findById(id: string): Promise<Order | null>;
  findLatestByPhoneNumber(phoneNumber: string): Promise<Order | null>;
  listAll(): Promise<Order[]>;
}
