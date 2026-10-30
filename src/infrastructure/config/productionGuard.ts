import { ENV } from './env.js';

/** Fails fast when a production process would silently run in development mode. */
export function assertProductionConfiguration(): void {
  if (ENV.NODE_ENV !== 'production') return;

  const missing: string[] = [];
  if (ENV.AI_PROVIDER === 'mock') missing.push('AI_PROVIDER (no puede ser mock)');
  if (ENV.WHATSAPP_PROVIDER === 'simulator') missing.push('WHATSAPP_PROVIDER (no puede ser simulator)');
  if (ENV.WHATSAPP_PROVIDER === 'cloud_api') {
    if (!ENV.WHATSAPP_TOKEN) missing.push('WHATSAPP_TOKEN');
    if (!ENV.WHATSAPP_PHONE_NUMBER_ID) missing.push('WHATSAPP_PHONE_NUMBER_ID');
    if (!ENV.WHATSAPP_VERIFY_TOKEN) missing.push('WHATSAPP_VERIFY_TOKEN');
    if (!ENV.WHATSAPP_APP_SECRET) missing.push('WHATSAPP_APP_SECRET');
  }
  if (ENV.WHATSAPP_PROVIDER === 'evolution_api') {
    if (!ENV.EVOLUTION_API_URL) missing.push('EVOLUTION_API_URL');
    if (!ENV.EVOLUTION_API_KEY) missing.push('EVOLUTION_API_KEY');
    if (!ENV.EVOLUTION_API_INSTANCE) missing.push('EVOLUTION_API_INSTANCE');
  }
  if (ENV.DATABASE_PROVIDER !== 'postgres' || !ENV.DATABASE_URL) missing.push('DATABASE_URL (PostgreSQL)');
  if (!ENV.REDIS_URL && !ENV.REDIS_HOST) missing.push('REDIS_URL o REDIS_HOST');
  if (ENV.REDIS_URL && !ENV.REDIS_URL.startsWith('rediss://')) missing.push('REDIS_URL (debe usar rediss://)');
  if (!ENV.ADMIN_API_TOKEN) missing.push('ADMIN_API_TOKEN');
  if (ENV.ENABLE_ORDER_OUTBOX && !ENV.PANEL_API_URL) missing.push('PANEL_API_URL cuando ENABLE_ORDER_OUTBOX=true');

  if (missing.length > 0) {
    throw new Error(`Configuración de producción incompleta: ${missing.join(', ')}`);
  }
}
