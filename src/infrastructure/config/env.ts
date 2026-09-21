import dotenv from 'dotenv';
import path from 'path';

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
  WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN || 'antojitos_webhook_token_secreto',
  KITCHEN_PHONE_NUMBER: process.env.KITCHEN_PHONE_NUMBER || '+573001234567',
  DATABASE_PATH: process.env.DATABASE_PATH || './data/antojitos.db'
};
