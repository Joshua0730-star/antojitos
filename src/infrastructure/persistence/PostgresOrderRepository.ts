import crypto from 'node:crypto';
import { Pool } from 'pg';
import { Customer } from '../../domain/entities/Customer.js';
import { Order, OrderProps } from '../../domain/entities/Order.js';
import { ExtraAddition, ExtraCheeseOption, OrderItem, SizeOption } from '../../domain/entities/OrderItem.js';
import { IOrderRepository } from '../../domain/repositories/IOrderRepository.js';
import { OrderStatus, OrderStatusType } from '../../domain/value-objects/OrderStatus.js';

interface OrderPayload {
  id: string;
  customer: ConstructorParameters<typeof Customer>[0];
  items: Array<ConstructorParameters<typeof OrderItem>[0]>;
  paymentMethod: OrderProps['paymentMethod'];
  cashBillAmount?: number;
  nequiReference?: string;
  nequiVerified: boolean;
  status: OrderStatusType;
  createdAt: string;
}

function serialize(order: Order): OrderPayload {
  return {
    id: order.id,
    customer: {
      name: order.customer.name,
      phoneNumber: order.customer.phoneNumber,
      deliveryType: order.customer.deliveryType,
      address: order.customer.address,
      neighborhoodOrMunicipality: order.customer.neighborhoodOrMunicipality,
      addressDetails: order.customer.addressDetails
    },
    items: order.items.map(item => ({
      productId: item.productId,
      productName: item.productName,
      category: item.category,
      basePrice: item.basePrice,
      quantity: item.quantity,
      size: item.size as SizeOption | undefined,
      toppings: item.toppings,
      sauce: item.sauce,
      extraAdditions: item.extraAdditions as ExtraAddition[] | undefined,
      iceCreamFlavor: item.iceCreamFlavor,
      extraCheese: item.extraCheese as ExtraCheeseOption | undefined
    })),
    paymentMethod: order.paymentMethod,
    cashBillAmount: order.cashBillAmount,
    nequiReference: order.nequiReference,
    nequiVerified: order.nequiVerified,
    status: order.status.value,
    createdAt: order.createdAt.toISOString()
  };
}

function deserialize(row: OrderPayload): Order {
  return new Order({
    id: row.id,
    customer: new Customer(row.customer),
    items: row.items.map(item => new OrderItem(item)),
    paymentMethod: row.paymentMethod,
    cashBillAmount: row.cashBillAmount,
    nequiReference: row.nequiReference,
    nequiVerified: row.nequiVerified,
    status: new OrderStatus(row.status),
    createdAt: new Date(row.createdAt)
  });
}

export class PostgresOrderRepository implements IOrderRepository {
  constructor(private readonly db: Pool) {}

  async save(order: Order): Promise<void> {
    const payload = serialize(order);
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO bot_orders (id, phone_number, created_at, payload)
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (id) DO NOTHING
         RETURNING id`,
        [order.id, order.customer.phoneNumber.trim(), order.createdAt, JSON.stringify(payload)]
      );
      if (inserted.rowCount === 0) {
        await client.query(
          `UPDATE bot_orders SET phone_number = $2, created_at = $3, payload = $4::jsonb WHERE id = $1`,
          [order.id, order.customer.phoneNumber.trim(), order.createdAt, JSON.stringify(payload)]
        );
      } else {
        await client.query(
          `INSERT INTO admin_notifications (id, type, title, body, resource_type, resource_id, payload)
           VALUES ($1, 'new_order', $2, $3, 'order', $4, $5::jsonb)`,
          [
            crypto.randomUUID(),
            'Nuevo pedido recibido',
            `${order.customer.name} · ${order.items.length} producto${order.items.length === 1 ? '' : 's'}`,
            order.id,
            JSON.stringify({ orderId: order.id, customerName: order.customer.name, phoneNumber: order.customer.phoneNumber })
          ]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* no-op */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async findById(id: string): Promise<Order | null> {
    const result = await this.db.query<{ payload: OrderPayload }>(
      'SELECT payload FROM bot_orders WHERE id = $1', [id]
    );
    return result.rows[0] ? deserialize(result.rows[0].payload) : null;
  }

  async findLatestByPhoneNumber(phoneNumber: string): Promise<Order | null> {
    const result = await this.db.query<{ payload: OrderPayload }>(
      'SELECT payload FROM bot_orders WHERE phone_number = $1 ORDER BY created_at DESC LIMIT 1',
      [phoneNumber.trim()]
    );
    return result.rows[0] ? deserialize(result.rows[0].payload) : null;
  }

  async listAll(): Promise<Order[]> {
    const result = await this.db.query<{ payload: OrderPayload }>(
      'SELECT payload FROM bot_orders ORDER BY created_at DESC'
    );
    return result.rows.map(row => deserialize(row.payload));
  }
}
