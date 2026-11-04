import 'dotenv/config';
import pg from 'pg';
import { IntentRouterService, type IntentMatch } from '../src/application/services/IntentRouterService.js';

type StoredMessage = {
  role?: string;
  author?: string;
  source?: string;
  content?: string;
  timestamp?: string;
};

type ConversationRow = {
  phone_number: string;
  messages: StoredMessage[];
};


type Category = 'saludo' | 'menu' | 'precio' | 'pago' | 'ubicacion' | 'horario' | 'pedido' | 'estado' | 'otro';

const router = new IntentRouterService();
const limit = Number(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || 100);

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function categoryOf(text: string): Category {
  const value = normalize(text);
  if (/^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|hi)\b/.test(value)) return 'saludo';
  if (/\b(menu|carta|catalogo|precios)\b/.test(value)) return 'menu';
  if (/(cuanto|cuanto|precio|valor|a como|que vale|cuanto seria)/.test(value)) return 'precio';
  if (/(nequi|transfer|cuenta|consign|efectivo|pagar|pago|numero pa copiar)/.test(value)) return 'pago';
  if (/(donde|ubicacion|direccion|punto fisico|local)/.test(value)) return 'ubicacion';
  if (/(horario|hora|abren|cierran|servicio)/.test(value)) return 'horario';
  if (/(estado|seguimiento|llego|confirmado|pedido listo)/.test(value)) return 'estado';
  if (/(fresa|oblea|ensalada|sandwich|pedido|ordenar|regalame|dame|quiero|domi|domicilio|recoger)/.test(value)) return 'pedido';
  return 'otro';
}

function expectedIntent(category: Category): IntentMatch['intent'] | null {
  const map: Partial<Record<Category, IntentMatch['intent']>> = {
    saludo: 'greeting', menu: 'menu_request', precio: 'price_query', pago: 'payment_methods',
    ubicacion: 'location', horario: 'business_hours', estado: 'order_status'
  };
  return map[category] || null;
}

function isHuman(message: StoredMessage): boolean {
  return message.role === 'assistant' && (message.author === 'human' || message.source === 'human_mobile');
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL no está configurada');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    const result = await pool.query<ConversationRow>('SELECT phone_number, messages FROM bot_conversations ORDER BY updated_at ASC');
    const customerMessages = result.rows.flatMap(row => (row.messages || [])
      .filter(message => message.role === 'user' && String(message.content || '').trim())
      .map(message => ({ phone: row.phone_number, message })));
    const replay = customerMessages.slice(0, Math.max(100, limit));
    const humanMessages = result.rows.flatMap(row => (row.messages || [])
      .filter(isHuman)
      .map(message => ({ phone: row.phone_number, text: String(message.content || '').trim() }))
      .filter(item => item.text));

    const byCategory = new Map<Category, number>();
    let routed = 0;
    let expectedRouted = 0;
    let concise = 0;
    for (const item of replay) {
      const text = String(item.message.content || '').trim();
      const category = categoryOf(text);
      byCategory.set(category, (byCategory.get(category) || 0) + 1);
      const match = router.routeIntent(text);
      if (match) routed++;
      const expected = expectedIntent(category);
      if (expected && match?.intent === expected) expectedRouted++;
      if (!match || match.response.length <= 320) concise++;
    }

    const humanCategories = new Map<Category, number>();
    for (const item of humanMessages) {
      const category = categoryOf(item.text);
      humanCategories.set(category, (humanCategories.get(category) || 0) + 1);
    }
    const orderRows = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
    const humanRows = [...humanCategories.entries()].sort((a, b) => b[1] - a[1]);
    console.log(JSON.stringify({
      historicalChats: result.rows.length,
      historicalMessages: result.rows.reduce((sum, row) => sum + (row.messages || []).length, 0),
      historicalCustomerMessages: customerMessages.length,
      humanAssistantMessages: humanMessages.length,
      replayedMessages: replay.length,
      categories: Object.fromEntries(orderRows),
      humanContextCategories: Object.fromEntries(humanRows),
      fastRouterCoverage: replay.length ? Number((routed / replay.length).toFixed(3)) : 0,
      expectedFaqAccuracy: expectedRouted,
      conciseReplies: concise,
      samples: replay.slice(0, 12).map(item => {
        const text = String(item.message.content || '').trim();
        const match = router.routeIntent(text);
        return { text, category: categoryOf(text), routedIntent: match?.intent || null, response: match?.response || null };
      })
    }, null, 2));
  } finally {
    await pool.end();
  }
}

await main();
