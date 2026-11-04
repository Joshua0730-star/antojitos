import { Pool } from 'pg';
import { ENV } from '../config/env.js';
import type { ChatMessage, ConversationState } from '../../domain/repositories/IConversationRepository.js';

let pool: Pool | undefined;

export function getPostgresPool(): Pool {
  if (!ENV.DATABASE_URL) {
    throw new Error('DATABASE_URL es obligatorio cuando DATABASE_PROVIDER=postgres');
  }

  pool ??= new Pool({
    connectionString: ENV.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true
  });

  return pool;
}

export async function initializePostgresSchema(): Promise<void> {
  const db = getPostgresPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS bot_orders (
      id TEXT PRIMARY KEY,
      phone_number TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      payload JSONB NOT NULL,
      idempotency_key TEXT
    );
    ALTER TABLE bot_orders ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS bot_orders_idempotency_key_idx
      ON bot_orders (idempotency_key) WHERE idempotency_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS bot_orders_phone_created_idx
      ON bot_orders (phone_number, created_at DESC);
    CREATE INDEX IF NOT EXISTS bot_orders_created_id_idx
      ON bot_orders (created_at DESC, id DESC);

    CREATE TABLE IF NOT EXISTS nequi_receipts (
      normalized_reference TEXT PRIMARY KEY,
      id TEXT NOT NULL,
      payload JSONB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bot_conversations (
      phone_number TEXT PRIMARY KEY,
      messages JSONB NOT NULL DEFAULT '[]'::jsonb,
      current_step INTEGER NOT NULL DEFAULT 1,
      current_order_id TEXT,
      coexistence_status TEXT NOT NULL DEFAULT 'BOT_ACTIVE',
      last_human_interaction TIMESTAMPTZ,
      bot_paused_indefinitely BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE bot_conversations ADD COLUMN IF NOT EXISTS human_pause_until TIMESTAMPTZ;
    ALTER TABLE bot_conversations ADD COLUMN IF NOT EXISTS human_takeover_started_at TIMESTAMPTZ;
    ALTER TABLE bot_conversations ADD COLUMN IF NOT EXISTS fsm_session JSONB;

    -- Back-office catalog foundation. These tables are isolated from the
    -- conversational tables so catalog edits cannot mutate live chat state.
    CREATE TABLE IF NOT EXISTS catalog_products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS catalog_product_variants (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES catalog_products(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sale_price_cents INTEGER NOT NULL CHECK (sale_price_cents >= 0),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (product_id, name)
    );
    CREATE TABLE IF NOT EXISTS inventory_ingredients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      unit TEXT NOT NULL CHECK (unit IN ('unit','gram','milliliter','portion')),
      quantity NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
      minimum_quantity NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (minimum_quantity >= 0),
      cost_per_unit_cents INTEGER NOT NULL DEFAULT 0 CHECK (cost_per_unit_cents >= 0),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS product_recipe_items (
      variant_id TEXT NOT NULL REFERENCES catalog_product_variants(id) ON DELETE CASCADE,
      ingredient_id TEXT NOT NULL REFERENCES inventory_ingredients(id) ON DELETE RESTRICT,
      quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
      PRIMARY KEY (variant_id, ingredient_id)
    );
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id TEXT PRIMARY KEY,
      ingredient_id TEXT NOT NULL REFERENCES inventory_ingredients(id) ON DELETE RESTRICT,
      movement_type TEXT NOT NULL CHECK (movement_type IN ('purchase','sale','adjustment','return')),
      quantity NUMERIC(14,3) NOT NULL CHECK (quantity <> 0),
      unit_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost_cents >= 0),
      reference_id TEXT,
      note TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS inventory_movements_ingredient_created_idx
      ON inventory_movements (ingredient_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL CHECK (source IN ('whatsapp','admin')),
      order_id TEXT REFERENCES bot_orders(id) ON DELETE SET NULL,
      status TEXT NOT NULL CHECK (status IN ('pending','confirmed','cancelled')),
      subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
      delivery_cents INTEGER NOT NULL DEFAULT 0 CHECK (delivery_cents >= 0),
      total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
      payment_method TEXT NOT NULL,
      confirmed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS sale_items (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      variant_id TEXT REFERENCES catalog_product_variants(id) ON DELETE SET NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
      customizations JSONB NOT NULL DEFAULT '{}'::jsonb
    );
    CREATE UNIQUE INDEX IF NOT EXISTS sales_order_id_unique_idx
      ON sales (order_id) WHERE order_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS admin_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS admin_notifications (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      resource_type TEXT,
      resource_id TEXT,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      read_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS admin_notifications_created_id_idx
      ON admin_notifications (created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS admin_notifications_unread_idx
      ON admin_notifications (read_at, created_at DESC);

    CREATE TABLE IF NOT EXISTS order_outbox (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL UNIQUE,
      payload JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'sent', 'dead')),
      attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
      next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_error TEXT,
      locked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS order_outbox_pending_idx
      ON order_outbox (next_attempt_at, created_at)
      WHERE status = 'pending';
    CREATE INDEX IF NOT EXISTS order_outbox_processing_lease_idx
      ON order_outbox (locked_at)
      WHERE status = 'processing';
    CREATE INDEX IF NOT EXISTS order_outbox_status_created_idx
      ON order_outbox (status, created_at);
  `);

  await mergeLegacyPhoneJidConversations(db);
}

/**
 * Evolution puede haber persistido el mismo contacto como teléfono plano y
 * como 573...@s.whatsapp.net. Se fusionan solo esos JID telefónicos; los LID
 * permanecen separados porque no se pueden mapear con seguridad a un teléfono.
 */
async function mergeLegacyPhoneJidConversations(db: Pool): Promise<void> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{
      phone_number: string;
      canonical_phone: string;
    }>(`SELECT phone_number, regexp_replace(phone_number, '@[^@]+$', '') AS canonical_phone
        FROM bot_conversations
        WHERE phone_number ~ '^[0-9]+@s\.whatsapp\.net$'`);

    for (const legacy of rows) {
      const canonical = await client.query<{
        phone_number: string;
        messages: ChatMessage[];
        current_step: number;
        current_order_id: string | null;
        coexistence_status: ConversationState['coexistenceStatus'];
        last_human_interaction: Date | null;
        human_takeover_started_at: Date | null;
        human_pause_until: Date | null;
        bot_paused_indefinitely: boolean;
        fsm_session: ConversationState['fsmSession'] | null;
        updated_at: Date;
      }>('SELECT * FROM bot_conversations WHERE phone_number = $1 FOR UPDATE', [legacy.canonical_phone]);
      const duplicate = await client.query<typeof canonical.rows[number]>(
        'SELECT * FROM bot_conversations WHERE phone_number = $1 FOR UPDATE',
        [legacy.phone_number]
      );
      const old = duplicate.rows[0];
      if (!old) continue;

      if (!canonical.rows[0]) {
        await client.query('UPDATE bot_conversations SET phone_number = $1 WHERE phone_number = $2', [legacy.canonical_phone, legacy.phone_number]);
        continue;
      }

      const current = canonical.rows[0];
      const messages = [...(current.messages || []), ...(old.messages || [])]
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      const newest = new Date(old.updated_at).getTime() > new Date(current.updated_at).getTime() ? old : current;
      await client.query(
        `UPDATE bot_conversations SET
          messages = $1::jsonb,
          current_step = $2,
          current_order_id = $3,
          coexistence_status = $4,
          last_human_interaction = $5,
          human_takeover_started_at = $6,
          human_pause_until = $7,
          bot_paused_indefinitely = $8,
          fsm_session = $9::jsonb,
          updated_at = $10
         WHERE phone_number = $11`,
        [JSON.stringify(messages), newest.current_step, newest.current_order_id, newest.coexistence_status,
          newest.last_human_interaction, newest.human_takeover_started_at, newest.human_pause_until,
          newest.bot_paused_indefinitely, JSON.stringify(newest.fsm_session), newest.updated_at, legacy.canonical_phone]
      );
      await client.query('DELETE FROM bot_conversations WHERE phone_number = $1', [legacy.phone_number]);
    }
    await client.query('COMMIT');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve original error */ }
    throw error;
  } finally {
    client.release();
  }
}

export async function closePostgresPool(): Promise<void> {
  if (!pool) return;
  const activePool = pool;
  pool = undefined;
  await activePool.end();
}
