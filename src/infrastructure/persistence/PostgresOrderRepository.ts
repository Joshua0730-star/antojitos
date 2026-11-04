import crypto from 'node:crypto';
import { Pool } from 'pg';
import { Customer } from '../../domain/entities/Customer.js';
import { Order, OrderProps } from '../../domain/entities/Order.js';
import { ExtraAddition, ExtraCheeseOption, OrderItem, SizeOption } from '../../domain/entities/OrderItem.js';
import { IOrderRepository } from '../../domain/repositories/IOrderRepository.js';
import { OrderStatus, OrderStatusType } from '../../domain/value-objects/OrderStatus.js';
import type { IOrderCreationPort } from '../../application/ports/IOrderCreationPort.js';
import type { PanelOrderPayload } from '../../application/ports/IPanelOrderNotifier.js';
import type { IOrderIdempotencyPort, IdempotentOrderResult } from '../../application/ports/IOrderIdempotencyPort.js';
import type { IOrderPaymentPort } from '../../application/ports/IOrderPaymentPort.js';

interface OrderPayload {
  id: string;
  customer: ConstructorParameters<typeof Customer>[0];
  items: Array<ConstructorParameters<typeof OrderItem>[0]>;
  paymentMethod: OrderProps['paymentMethod'];
  cashBillAmount?: number;
  nequiReference?: string;
  nequiVerified: boolean;
  deliveryFee?: number;
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
    deliveryFee: order.deliveryFee,
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
    deliveryFee: row.deliveryFee,
    status: new OrderStatus(row.status),
    createdAt: new Date(row.createdAt)
  });
}

export class PostgresOrderRepository implements IOrderRepository, IOrderCreationPort, IOrderIdempotencyPort, IOrderPaymentPort {
  constructor(private readonly db: Pool) {}

  async save(order: Order): Promise<void> {
    const payload = serialize(order);
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await this.saveOrderInTransaction(client, order, payload);
      await client.query('COMMIT');
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* no-op */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async saveOrderAndEnqueue(order: Order, panelPayload: PanelOrderPayload): Promise<void> {
    const payload = serialize(order);
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await this.saveOrderInTransaction(client, order, payload);
      await client.query(
        `INSERT INTO order_outbox (id, order_id, payload, next_attempt_at)
         VALUES ($1, $2, $3::jsonb, NOW())
         ON CONFLICT (order_id) DO NOTHING`,
        [crypto.randomUUID(), order.id, JSON.stringify(panelPayload)]
      );
      await client.query('COMMIT');
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async saveOrderIdempotently(order: Order, idempotencyKey: string): Promise<IdempotentOrderResult> {
    if (!idempotencyKey.trim()) throw new Error('idempotencyKey es obligatorio');
    const payload = serialize(order);
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO bot_orders (id, phone_number, created_at, payload, idempotency_key)
         VALUES ($1, $2, $3, $4::jsonb, $5)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING id`,
        [order.id, order.customer.phoneNumber.trim(), order.createdAt, JSON.stringify(payload), idempotencyKey.trim()]
      );
      if (inserted.rowCount === 1) {
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
        await client.query('COMMIT');
        return { created: true, order };
      }

      const existing = await client.query<{ payload: OrderPayload }>(
        'SELECT payload FROM bot_orders WHERE idempotency_key = $1 FOR UPDATE',
        [idempotencyKey.trim()]
      );
      if (!existing.rows[0]) throw new Error('No se pudo resolver la orden idempotente');
      await client.query('COMMIT');
      return { created: false, order: deserialize(existing.rows[0].payload) };
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  private async saveOrderInTransaction(client: { query: <T = unknown>(text: string, values?: unknown[]) => Promise<{ rowCount: number | null; rows?: T[] }> }, order: Order, payload: OrderPayload): Promise<void> {
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
      return;
    }

    const sale = await client.query<{ id: string }>(
      `INSERT INTO sales (
        id, source, order_id, status, subtotal_cents, delivery_cents, total_cents, payment_method
      ) VALUES ($1, 'whatsapp', $2, 'pending', $3, $4, $5, $6)
      ON CONFLICT (order_id) DO NOTHING
      RETURNING id`,
      [crypto.randomUUID(), order.id, order.getSubtotal().amount, order.deliveryFee, order.getTotal().amount, order.paymentMethod]
    );
    const saleId = sale.rows?.[0]?.id;
    if (saleId) {
      for (const item of order.items) {
        await client.query(
          `INSERT INTO sale_items (
            id, sale_id, variant_id, product_name, quantity, unit_price_cents, customizations
          ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
          [
            crypto.randomUUID(),
            saleId,
            item.productId,
            item.productName,
            item.quantity,
            item.getUnitPrice().amount,
            JSON.stringify({
              size: item.size,
              toppings: item.toppings,
              sauce: item.sauce,
              extraAdditions: item.extraAdditions,
              extraCheese: item.extraCheese,
              iceCreamFlavor: item.iceCreamFlavor
            })
          ]
        );
      }
    }
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

  async findById(id: string): Promise<Order | null> {
    const result = await this.db.query<{ payload: OrderPayload }>(
      'SELECT payload FROM bot_orders WHERE id = $1', [id]
    );
    return result.rows[0] ? deserialize(result.rows[0].payload) : null;
  }

  async markPaymentVerified(orderId: string, reference: string): Promise<boolean> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const updated = await client.query(
        `UPDATE bot_orders
         SET payload = jsonb_set(
           jsonb_set(
             jsonb_set(payload, '{nequiVerified}', 'true'::jsonb),
             '{nequiReference}', to_jsonb($2::text)
           ),
           '{status}', '"PAYMENT_VERIFIED"'::jsonb
         )
         WHERE id = $1
           AND payload->>'paymentMethod' = 'NEQUI'
           AND payload->>'status' <> 'CANCELLED'
         RETURNING id`,
        [orderId, reference]
      );
      if (updated.rowCount !== 1) {
        await client.query('ROLLBACK');
        return false;
      }
      await client.query(
        `UPDATE sales SET status = 'confirmed', confirmed_at = NOW()
         WHERE order_id = $1 AND status <> 'cancelled'`,
        [orderId]
      );
      await client.query(
        `INSERT INTO admin_notifications (id, type, title, body, resource_type, resource_id, payload)
         VALUES ($1, 'payment_verified', $2, $3, 'order', $4, $5::jsonb)`,
        [
          crypto.randomUUID(),
          'Pago Nequi verificado',
          `La orden ${orderId} tiene un comprobante validado. Ref. ${reference.slice(-4)}`,
          orderId,
          JSON.stringify({ orderId, reference: reference.slice(-4) })
        ]
      );
      await client.query('COMMIT');
      return true;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
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
