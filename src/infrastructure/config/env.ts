import dotenv from 'dotenv';

dotenv.config();

export const ENV = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  AI_PROVIDER: (process.env.AI_PROVIDER || 'openai') as 'openai' | 'gemini' | 'mock',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
  WHATSAPP_PROVIDER: (process.env.WHATSAPP_PROVIDER || 'simulator') as 'simulator' | 'cloud_api' | 'evolution_api',
  WHATSAPP_TOKEN: process.env.WHATSAPP_TOKEN || '',
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  EVOLUTION_API_URL: process.env.EVOLUTION_API_URL || '',
  EVOLUTION_API_KEY: process.env.EVOLUTION_API_KEY || '',
  EVOLUTION_API_INSTANCE: process.env.EVOLUTION_API_INSTANCE || '',
  EVOLUTION_HUMAN_SOURCES: (process.env.EVOLUTION_HUMAN_SOURCES || 'android,ios').split(',').map(value => value.trim().toLowerCase()).filter(Boolean),
  // No usar tokens de verificación conocidos por defecto: en producción debe
  // existir una credencial explícita configurada fuera del repositorio.
  WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN || '',
  WHATSAPP_APP_SECRET: process.env.WHATSAPP_APP_SECRET || '',
  KITCHEN_PHONE_NUMBER: process.env.KITCHEN_PHONE_NUMBER || '+573001234567',
  DATABASE_PROVIDER: (process.env.DATABASE_PROVIDER || (process.env.DATABASE_URL ? 'postgres' : 'local')) as 'local' | 'postgres',
  DATABASE_URL: process.env.DATABASE_URL || '',
  DATABASE_PATH: process.env.DATABASE_PATH || './data/antojitos.db',
  REDIS_URL: process.env.REDIS_URL || '',
  REDIS_HOST: process.env.REDIS_HOST || '',
  REDIS_PORT: parseInt(process.env.REDIS_PORT || '6379', 10),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || undefined,
  MESSAGE_DEBOUNCE_MS: parseInt(process.env.MESSAGE_DEBOUNCE_MS || '3000', 10),
  MAX_CONTEXT_MESSAGES: parseInt(process.env.MAX_CONTEXT_MESSAGES || '10', 10),
  BUSINESS_PHONE_NUMBER: process.env.BUSINESS_PHONE_NUMBER || '',
  // La intervención humana silencia únicamente esa conversación durante cinco minutos.
  COEXISTENCE_COOLDOWN_MINUTES: parseInt(process.env.COEXISTENCE_COOLDOWN_MINUTES || '5', 10),
  ENABLE_SEMANTIC_ROUTING: process.env.ENABLE_SEMANTIC_ROUTING !== 'false',
  ADMIN_API_TOKEN: process.env.ADMIN_API_TOKEN || '',
  // Lista explícita y normalizada de teléfonos que pueden operar el panel.
  // El token sigue siendo obligatorio: el teléfono funciona como segunda barrera.
  ADMIN_ALLOWED_PHONES: (process.env.ADMIN_ALLOWED_PHONES || '')
    .split(',')
    .map(value => value.replace(/\D/g, ''))
    .filter(value => value.length >= 7)
  ,BUSINESS_TIMEZONE: process.env.BUSINESS_TIMEZONE || 'America/Bogota'
  ,BUSINESS_OPEN_MINUTE: parseInt(process.env.BUSINESS_OPEN_MINUTE || '780', 10)
  ,BUSINESS_CLOSE_MINUTE: parseInt(process.env.BUSINESS_CLOSE_MINUTE || '1260', 10)
  ,BUSINESS_CLOSED_WEEKDAYS: (process.env.BUSINESS_CLOSED_WEEKDAYS || '1').split(',').map(value => parseInt(value.trim(), 10)).filter(Number.isInteger)
  ,BUSINESS_CLOSED_MESSAGE: process.env.BUSINESS_CLOSED_MESSAGE || '¡Hola! 🍓 En este momento estamos fuera de horario. Déjanos tu mensaje y te atenderemos en nuestro próximo horario de atención.'
  ,MENU_PDF_URL: process.env.MENU_PDF_URL || 'https://antojitos-bot-tcb4sy2tpq-uc.a.run.app/menu.pdf'
};
