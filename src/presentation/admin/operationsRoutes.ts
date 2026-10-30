import crypto from 'node:crypto';
import type { Express, Request, Response } from 'express';
import type { Pool, PoolClient } from 'pg';

type Auth = (req: Request) => boolean;
type DbFactory = () => Pool;

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 160) throw new Error(`${field} es obligatorio`);
  return value.trim();
}
function money(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${field} debe ser un entero no negativo`);
  return n;
}
function qty(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${field} debe ser mayor que cero`);
  return n;
}
function fail(res: Response, error: unknown): void {
  res.status(400).json({ error: error instanceof Error ? error.message : 'Solicitud inválida' });
}
async function audit(client: Pick<Pool, 'query'>, action: string, resourceType: string, resourceId: string, metadata: unknown) {
  await client.query('INSERT INTO admin_audit_log (id,action,resource_type,resource_id,metadata) VALUES ($1,$2,$3,$4,$5)', [crypto.randomUUID(), action, resourceType, resourceId, JSON.stringify(metadata ?? {})]);
}

export function registerOperationsRoutes(app: Express, isAdminRequest: Auth, getDb: DbFactory): void {
  const allowedOrderStatuses = new Set(['DRAFT', 'PENDING_PAYMENT', 'PAYMENT_VERIFIED', 'SENT_TO_KITCHEN', 'CANCELLED']);

  app.get('/api/admin/orders', async (req, res) => {
    if (!isAdminRequest(req)) { res.status(401).json({ error: 'No autorizado' }); return; }
    try {
      const requestedLimit = Number(req.query.limit ?? 20);
      const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 50) : 20;
      let cursor: { createdAt: string; id: string } | null = null;
      if (typeof req.query.cursor === 'string' && req.query.cursor.length <= 512) {
        try { cursor = JSON.parse(Buffer.from(req.query.cursor, 'base64url').toString('utf8')); } catch { cursor = null; }
      }
      const result = await getDb().query(`SELECT id, phone_number AS "phoneNumber", created_at AS "createdAt",
        payload->'customer'->>'name' AS "customerName", payload->>'status' AS status,
        payload->>'paymentMethod' AS "paymentMethod", payload->'items' AS items
        FROM bot_orders
        WHERE ($1::timestamptz IS NULL OR (created_at, id) < ($1::timestamptz, $2::text))
        ORDER BY created_at DESC, id DESC LIMIT $3`, [cursor?.createdAt ?? null, cursor?.id ?? null, limit + 1]);
      const hasMore = result.rows.length > limit;
      const orders = hasMore ? result.rows.slice(0, limit) : result.rows;
      const last = orders[orders.length - 1];
      const nextCursor = hasMore && last
        ? Buffer.from(JSON.stringify({ createdAt: last.createdAt, id: last.id })).toString('base64url')
        : null;
      res.json({ orders, nextCursor, pageSize: limit });
    } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : 'Base de datos no disponible' }); }
  });

  app.get('/api/admin/notifications', async (req, res) => {
    if (!isAdminRequest(req)) { res.status(401).json({ error: 'No autorizado' }); return; }
    try {
      const requestedLimit = Number(req.query.limit ?? 20);
      const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 50) : 20;
      const since = typeof req.query.since === 'string' && !Number.isNaN(Date.parse(req.query.since)) ? req.query.since : null;
      let cursor: { createdAt: string; id: string } | null = null;
      if (typeof req.query.cursor === 'string' && req.query.cursor.length <= 512) {
        try { cursor = JSON.parse(Buffer.from(req.query.cursor, 'base64url').toString('utf8')); } catch { cursor = null; }
      }
      const db = getDb();
      const [list, unread] = await Promise.all([
        db.query(`SELECT id, type, title, body, resource_type AS "resourceType", resource_id AS "resourceId",
            payload, created_at AS "createdAt", read_at AS "readAt"
          FROM admin_notifications
          WHERE ${since ? 'created_at > $1::timestamptz' : '($1::timestamptz IS NULL OR (created_at, id) > ($2::timestamptz, $3::text))'}
          ORDER BY created_at ${since ? 'ASC' : 'ASC'}, id ASC LIMIT ${since ? '$2' : '$4'}`,
          since ? [since, limit + 1] : [null, cursor?.createdAt ?? null, cursor?.id ?? '', limit + 1]),
        db.query<{ count: string }>('SELECT COUNT(*)::int AS count FROM admin_notifications WHERE read_at IS NULL')
      ]);
      const hasMore = list.rows.length > limit;
      const notifications = hasMore ? list.rows.slice(0, limit) : list.rows;
      const last = notifications[notifications.length - 1];
      const nextCursor = hasMore && last
        ? Buffer.from(JSON.stringify({ createdAt: last.createdAt, id: last.id })).toString('base64url')
        : null;
      res.json({ notifications, unreadCount: Number(unread.rows[0]?.count ?? 0), nextCursor, pageSize: limit });
    } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : 'No se pudieron cargar las notificaciones' }); }
  });

  app.patch('/api/admin/notifications/:id/read', async (req, res) => {
    if (!isAdminRequest(req)) { res.status(401).json({ error: 'No autorizado' }); return; }
    try {
      const result = await getDb().query('UPDATE admin_notifications SET read_at = COALESCE(read_at, NOW()) WHERE id = $1 RETURNING id', [text(req.params.id, 'notificationId')]);
      if (!result.rowCount) { res.status(404).json({ error: 'Notificación no encontrada' }); return; }
      res.json({ ok: true, id: result.rows[0].id });
    } catch (error) { fail(res, error); }
  });

  app.post('/api/admin/notifications/read-all', async (req, res) => {
    if (!isAdminRequest(req)) { res.status(401).json({ error: 'No autorizado' }); return; }
    try {
      const result = await getDb().query('UPDATE admin_notifications SET read_at = COALESCE(read_at, NOW()) WHERE read_at IS NULL');
      res.json({ ok: true, marked: result.rowCount ?? 0 });
    } catch (error) { fail(res, error); }
  });

  app.patch('/api/admin/orders/:id/status', async (req, res) => {
    if (!isAdminRequest(req)) { res.status(401).json({ error: 'No autorizado' }); return; }
    const orderId = text(req.params.id, 'orderId');
    const status = text(req.body?.status, 'status').toUpperCase();
    if (!allowedOrderStatuses.has(status)) { res.status(400).json({ error: 'Estado de pedido no permitido' }); return; }
    const db = getDb();
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const existing = (await client.query('SELECT id,payload FROM bot_orders WHERE id=$1 FOR UPDATE', [orderId])).rows[0];
      if (!existing) throw new Error('Pedido no encontrado');
      const previousStatus = existing.payload?.status;
      if (previousStatus === status) { await client.query('ROLLBACK'); res.json({ ok: true, orderId, status, unchanged: true }); return; }
      await client.query(`UPDATE bot_orders
        SET payload = jsonb_set(
          jsonb_set(payload,'{status}',to_jsonb($2::text),true),
          '{nequiVerified}', to_jsonb(($2::text = 'PAYMENT_VERIFIED')), true
        ) WHERE id=$1`, [orderId, status]);
      await audit(client, 'status_change', 'order', orderId, { previousStatus, status });
      await client.query('COMMIT');
      res.json({ ok: true, orderId, previousStatus, status });
    } catch (error) { try { await client.query('ROLLBACK'); } catch { /* no-op */ } fail(res, error); }
    finally { client.release(); }
  });

  app.get('/api/admin/sales', async (req, res) => {
    if (!isAdminRequest(req)) { res.status(401).json({ error: 'No autorizado' }); return; }
    try {
      const result = await getDb().query(`SELECT id,source,order_id AS "orderId",status,subtotal_cents AS "subtotalCents",
        delivery_cents AS "deliveryCents",total_cents AS "totalCents",payment_method AS "paymentMethod",
        confirmed_at AS "confirmedAt",created_at AS "createdAt" FROM sales ORDER BY created_at DESC LIMIT 200`);
      res.json({ sales: result.rows });
    } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : 'Base de datos no disponible' }); }
  });

  app.post('/api/admin/sales', async (req, res) => {
    if (!isAdminRequest(req)) { res.status(401).json({ error: 'No autorizado' }); return; }
    try {
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      if (!items.length || items.length > 100) throw new Error('La venta debe contener productos');
      const source = req.body?.source === 'whatsapp' ? 'whatsapp' : 'admin';
      const paymentMethod = text(req.body?.paymentMethod || 'pendiente', 'paymentMethod');
      const deliveryCents = money(req.body?.deliveryCents ?? 0, 'deliveryCents');
      const normalized = items.map((item: any) => ({
        variantId: item.variantId ? text(item.variantId, 'variantId') : null,
        productName: text(item.productName, 'productName'),
        quantity: Math.max(1, Math.floor(Number(item.quantity))),
        unitPriceCents: money(item.unitPriceCents, 'unitPriceCents'),
        customizations: item.customizations && typeof item.customizations === 'object' ? item.customizations : {}
      }));
      const subtotalCents = normalized.reduce((sum: number, item: any) => sum + item.quantity * item.unitPriceCents, 0);
      const id = crypto.randomUUID();
      const db = getDb();
      await db.query('BEGIN');
      try {
        await db.query(`INSERT INTO sales (id,source,order_id,status,subtotal_cents,delivery_cents,total_cents,payment_method)
          VALUES ($1,$2,$3,'pending',$4,$5,$6,$7)`, [id, source, req.body?.orderId || null, subtotalCents, deliveryCents, subtotalCents + deliveryCents, paymentMethod]);
        for (const item of normalized) await db.query(`INSERT INTO sale_items (id,sale_id,variant_id,product_name,quantity,unit_price_cents,customizations)
          VALUES ($1,$2,$3,$4,$5,$6,$7)`, [crypto.randomUUID(), id, item.variantId, item.productName, item.quantity, item.unitPriceCents, JSON.stringify(item.customizations)]);
        await audit(db, 'create', 'sale', id, { source, itemCount: normalized.length });
        await db.query('COMMIT');
      } catch (error) { await db.query('ROLLBACK'); throw error; }
      res.status(201).json({ ok: true, saleId: id, status: 'pending', subtotalCents, deliveryCents, totalCents: subtotalCents + deliveryCents });
    } catch (error) { fail(res, error); }
  });

  app.post('/api/admin/sales/:id/confirm', async (req, res) => {
    if (!isAdminRequest(req)) { res.status(401).json({ error: 'No autorizado' }); return; }
    const saleId = req.params.id;
    const db = getDb();
    try {
      await db.query('BEGIN');
      const sale = (await db.query('SELECT id,status FROM sales WHERE id=$1 FOR UPDATE', [saleId])).rows[0];
      if (!sale) throw new Error('Venta no encontrada');
      if (sale.status === 'confirmed') { await db.query('ROLLBACK'); res.json({ ok: true, status: 'confirmed', alreadyConfirmed: true }); return; }
      if (sale.status === 'cancelled') throw new Error('No se puede confirmar una venta cancelada');
      const items = (await db.query('SELECT variant_id AS "variantId",quantity FROM sale_items WHERE sale_id=$1', [saleId])).rows;
      for (const item of items) {
        if (!item.variantId) continue;
        const ingredients = (await db.query(`SELECT ingredient_id AS "ingredientId",quantity FROM product_recipe_items WHERE variant_id=$1`, [item.variantId])).rows;
        for (const ingredient of ingredients) {
          const required = Number(ingredient.quantity) * Number(item.quantity);
          const updated = await db.query(`UPDATE inventory_ingredients SET quantity=quantity-$1,updated_at=NOW()
            WHERE id=$2 AND quantity >= $1 RETURNING quantity`, [required, ingredient.ingredientId]);
          if (!updated.rowCount) throw new Error(`Inventario insuficiente para el ingrediente ${ingredient.ingredientId}`);
          await db.query(`INSERT INTO inventory_movements (id,ingredient_id,movement_type,quantity,reference_id,note)
            VALUES ($1,$2,'sale',$3,$4,$5)`, [crypto.randomUUID(), ingredient.ingredientId, -required, saleId, 'Descuento por venta confirmada']);
        }
      }
      await db.query(`UPDATE sales SET status='confirmed',confirmed_at=NOW() WHERE id=$1`, [saleId]);
      await audit(db, 'confirm', 'sale', saleId, { inventoryAdjusted: true });
      await db.query('COMMIT');
      res.json({ ok: true, status: 'confirmed', inventoryAdjusted: true });
    } catch (error) { try { await db.query('ROLLBACK'); } catch { /* no-op */ } fail(res, error); }
  });

  app.post('/api/admin/purchases', async (req, res) => {
    if (!isAdminRequest(req)) { res.status(401).json({ error: 'No autorizado' }); return; }
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) { res.status(400).json({ error: 'La compra debe contener ingredientes' }); return; }
    const db = getDb();
    const purchaseId = crypto.randomUUID();
    try {
      await db.query('BEGIN');
      for (const item of items) {
        const ingredientId = text(item?.ingredientId, 'ingredientId');
        const quantity = qty(item?.quantity, 'quantity');
        const unitCostCents = money(item?.unitCostCents ?? 0, 'unitCostCents');
        const updated = await db.query('UPDATE inventory_ingredients SET quantity=quantity+$1,cost_per_unit_cents=$2,updated_at=NOW() WHERE id=$3 RETURNING id', [quantity, unitCostCents, ingredientId]);
        if (!updated.rowCount) throw new Error(`Ingrediente no encontrado: ${ingredientId}`);
        await db.query(`INSERT INTO inventory_movements (id,ingredient_id,movement_type,quantity,unit_cost_cents,reference_id,note)
          VALUES ($1,$2,'purchase',$3,$4,$5,$6)`, [crypto.randomUUID(), ingredientId, quantity, unitCostCents, purchaseId, String(req.body?.supplier || '').slice(0,160)]);
      }
      await audit(db, 'create', 'purchase', purchaseId, { itemCount: items.length });
      await db.query('COMMIT');
      res.status(201).json({ ok: true, purchaseId, itemCount: items.length });
    } catch (error) { try { await db.query('ROLLBACK'); } catch { /* no-op */ } fail(res, error); }
  });
}
