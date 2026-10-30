import { Pool } from 'pg';
import { ENV } from '../config/env.js';

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
      payload JSONB NOT NULL
    );
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
  `);
}

export async function closePostgresPool(): Promise<void> {
  if (!pool) return;
  const activePool = pool;
  pool = undefined;
  await activePool.end();
}
