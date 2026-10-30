import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ENV } from './infrastructure/config/env.js';
import { createContainer } from './infrastructure/di/container.js';
import { WhatsAppWebhookController } from './presentation/controllers/WhatsAppWebhookController.js';
import { closePostgresPool, initializePostgresSchema } from './infrastructure/persistence/PostgresDatabase.js';
import { initializeSqliteSchema } from './infrastructure/persistence/init-sqlite-db.js';
import { adminPageHtml } from './presentation/admin/adminPage.js';
import { getPostgresPool } from './infrastructure/persistence/PostgresDatabase.js';
import { OpenAIAudioTranscriptionService } from './infrastructure/audio/OpenAIAudioTranscriptionService.js';
import { registerOperationsRoutes } from './presentation/admin/operationsRoutes.js';

if (ENV.DATABASE_PROVIDER === 'postgres') {
  await initializePostgresSchema();
} else {
  initializeSqliteSchema();
}

const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({
  limit: '2mb',
  verify: (req, _res, buffer) => {
    (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
  }
}));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

const adminRateBuckets = new Map<string, { startedAt: number; count: number }>();
function adminRateLimit(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now();
  const key = req.socket.remoteAddress || 'unknown';
  const bucket = adminRateBuckets.get(key);
  if (!bucket || now - bucket.startedAt >= 60_000) {
    adminRateBuckets.set(key, { startedAt: now, count: 1 });
    next();
    return;
  }
  bucket.count += 1;
  if (bucket.count > 60) {
    res.setHeader('Retry-After', '60');
    res.status(429).json({ error: 'Demasiadas solicitudes administrativas' });
    return;
  }
  next();
}
app.use('/api/admin', adminRateLimit);

app.get('/menu.pdf', (_req, res) => {
  const file = path.resolve(process.cwd(), 'data', 'menu_pdf', 'menu_antojitos_v2.pdf');
  if (!fs.existsSync(file)) { res.status(404).send('Menú no disponible'); return; }
  res.type('application/pdf').sendFile(file);
});

// Iniciar inyección de dependencias
const container = createContainer();
const webhookController = new WhatsAppWebhookController(
  container.processIncomingMessageUseCase,
  container.whatsAppService,
  container.idempotencyService,
  container.debouncerService,
  container.coexistenceService
  ,container.operatingSchedule,
  ENV.OPENAI_API_KEY ? new OpenAIAudioTranscriptionService(ENV.OPENAI_API_KEY) : undefined
);

function normalizePhone(value: string): string {
  return value.replace(/\D/g, '');
}

function isAdminPhoneAuthorized(req: Request): boolean {
  const presentedPhone = normalizePhone(req.get('x-admin-phone') || '');
  return Boolean(presentedPhone && ENV.ADMIN_ALLOWED_PHONES.includes(presentedPhone));
}

function isAdminRequest(req: Request): boolean {
  const configuredToken = ENV.ADMIN_API_TOKEN;
  const presentedToken = req.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  const tokenMatches = Boolean(configuredToken && presentedToken && configuredToken.length === presentedToken.length &&
    crypto.timingSafeEqual(Buffer.from(configuredToken), Buffer.from(presentedToken)));
  return tokenMatches && isAdminPhoneAuthorized(req);
}

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'AntojitosBot',
    aiProvider: ENV.AI_PROVIDER,
    whatsappProvider: ENV.WHATSAPP_PROVIDER,
    redis: container.cacheService.getStatus(),
    metrics: container.observability.getSnapshot(),
    timestamp: new Date().toISOString()
  });
});

// Diagnóstico interno para el desarrollador/operador. Nunca se expone al cliente
// ni incluye texto de chats, teléfonos, credenciales o payloads de WhatsApp.
app.get('/api/internal/evaluation', (req, res) => {
  if (!isAdminRequest(req)) {
    res.status(ENV.ADMIN_API_TOKEN && ENV.ADMIN_ALLOWED_PHONES.length ? 401 : 503).json({ error: 'Endpoint interno no disponible' });
    return;
  }
  res.json({
    generatedAt: new Date().toISOString(),
    metrics: container.observability.getSnapshot(),
    recommendations: container.observability.getInternalRecommendations()
  });
});

// Panel administrativo: las acciones nunca se envían por WhatsApp al cliente.
app.get('/admin', (_req, res) => {
  const adminHtml = adminPageHtml()
    .replace('Diseño reservado en Stitch y preparado para la siguiente fase. Se mantiene deshabilitado para no alterar el bot antes de publicar recetas y permisos.', 'Esta sección estará disponible cuando se complete la configuración operativa necesaria.')
    .replace('MÓDULO BLOQUEADO · SIN IMPACTO EN CLIENTES', 'NO DISPONIBLE ACTUALMENTE')
    .replace('<h2>Acciones operativas</h2><p>Solo controles que afectan el servicio en tiempo real.</p>', '<h2>Control del bot</h2><p>Gestiona el estado del asistente y revisa los pedidos recibidos por WhatsApp. Estos controles son internos y no envían comandos al cliente.</p>')
    .replace("$('scheduleText').textContent=d.schedule?.isOpen?'Abierto':'Cerrado';", "const scheduleOpen=Boolean(d.schedule?.open ?? d.schedule?.isOpen);setLed('scheduleLed',scheduleOpen,scheduleOpen?'ok':'warn');$('scheduleText').textContent=scheduleOpen?'Abierto':'Cerrado';")
    .replace('<p style="text-align:center;color:#8a8782;font-size:12px;margin-top:22px">', `<section class="panel" style="margin-top:16px"><h2>Gestión de pedidos</h2><p>Actualiza el estado operativo de pedidos creados desde WhatsApp.</p><div id="ordersNotice" class="notice"></div><div id="ordersList" class="empty">Comprueba el sistema para cargar pedidos.</div></section><p style="text-align:center;color:#8a8782;font-size:12px;margin-top:22px">`)
    .replace('</script></body></html>', `async function loadOrders(){const box=$('ordersList');if(!auth){box.textContent='Comprueba el sistema para cargar pedidos.';return}try{const r=await fetch('/api/admin/orders',{headers:{Authorization:'Bearer '+token()}});const d=await r.json();if(!r.ok){box.textContent=d.error||'No se pudieron cargar los pedidos.';return}if(!d.orders?.length){box.textContent='No hay pedidos registrados.';return}const itemSummary=o=>(Array.isArray(o.items)?o.items:[]).map(i=>(i.quantity||1)+' × '+(i.productName||i.nombre||'Producto')).join(', ')||'Detalle no disponible';box.innerHTML='<table class="table"><thead><tr><th>Pedido</th><th>Cliente y detalle</th><th>Pago</th><th>Estado</th><th>Acción</th></tr></thead><tbody>'+d.orders.map(o=>'<tr><td class="mono">'+escapeHtml(o.id)+'<br><small>'+escapeHtml(new Date(o.createdAt).toLocaleString('es-CO'))+'</small></td><td>'+escapeHtml(o.customerName||o.phoneNumber||'Cliente')+'<br><small>'+escapeHtml(itemSummary(o))+'</small></td><td>'+escapeHtml(o.paymentMethod||'Pendiente')+'</td><td><select class="input order-status" data-id="'+escapeHtml(o.id)+'"><option value="DRAFT">Borrador</option><option value="PENDING_PAYMENT">Pendiente de pago</option><option value="PAYMENT_VERIFIED">Pago verificado</option><option value="SENT_TO_KITCHEN">En preparación</option><option value="CANCELLED">Cancelado</option></select></td><td><button class="btn" onclick="updateOrderStatus(this)">Guardar</button></td></tr>').join('')+'</tbody></table>';d.orders.forEach(o=>{const s=document.querySelector('.order-status[data-id="'+CSS.escape(o.id)+'"]');if(s)s.value=o.status})}catch(e){box.textContent='No se pudo conectar con la gestión de pedidos.'}}async function updateOrderStatus(button){const row=button.closest('tr'),select=row.querySelector('.order-status'),id=select.dataset.id;if(!confirm('¿Guardar el nuevo estado de este pedido?'))return;button.disabled=true;try{const r=await fetch('/api/admin/orders/'+encodeURIComponent(id)+'/status',{method:'PATCH',headers:{Authorization:'Bearer '+token(),'Content-Type':'application/json'},body:JSON.stringify({status:select.value})});const d=await r.json();const n=$('ordersNotice');n.className='notice show '+(r.ok?'success':'error');n.textContent=r.ok?'Estado actualizado correctamente.':(d.error||'No se pudo actualizar el pedido.');if(r.ok)loadOrders()}finally{button.disabled=false}}if(token())setTimeout(loadOrders,700);</script></body></html>`);
  res.type('html').send(adminHtml);
  return;
  res.type('html').send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Antojitos · Administración</title><style>
  :root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#241714;background:#fbf8f6;line-height:1.45}*{box-sizing:border-box}body{margin:0}.shell{max-width:920px;margin:auto;padding:clamp(20px,5vw,56px) 18px}.top{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:28px}.eyebrow{font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#aa5961;margin:0 0 8px}.title{font-size:clamp(28px,5vw,42px);letter-spacing:-.04em;margin:0}.subtitle{color:#786b66;margin:8px 0 0}.mark{width:48px;height:48px;border-radius:16px;background:#ffe1df;display:grid;place-items:center;font-size:25px;flex:none}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.card{background:#fff;border:1px solid #eee5e1;border-radius:20px;padding:22px;box-shadow:0 8px 30px #4322180a}.wide{grid-column:1/-1}.card h2{font-size:18px;margin:0 0 6px;letter-spacing:-.02em}.hint{font-size:13px;color:#877a75;margin:0 0 18px}.label{font-size:13px;font-weight:650;display:block;margin-bottom:7px}.input{width:100%;border:1px solid #ded4d0;border-radius:11px;padding:12px 13px;font:inherit;outline:none;background:#fff}.input:focus{border-color:#cb6872;box-shadow:0 0 0 3px #cb68721c}.row{display:flex;gap:10px;flex-wrap:wrap}.btn{border:0;border-radius:11px;padding:11px 15px;font:inherit;font-weight:700;cursor:pointer;background:#c95767;color:#fff;transition:transform .15s,opacity .15s}.btn:hover{transform:translateY(-1px)}.btn:disabled{opacity:.55;cursor:wait;transform:none}.btn.secondary{background:#f3ece9;color:#5a423b}.btn.danger{background:#8b3948}.status{display:flex;align-items:center;gap:8px;font-size:13px;color:#786b66;margin-top:14px}.dot{width:9px;height:9px;border-radius:50%;background:#ccbdb8}.dot.ok{background:#36a269}.result{margin:16px 0 0;min-height:34px;padding:13px;border-radius:12px;background:#faf7f5;white-space:pre-wrap;overflow:auto;font-size:12px;color:#574841}.footer{color:#978985;font-size:12px;text-align:center;margin-top:22px}@media(max-width:680px){.grid{grid-template-columns:1fr}.wide{grid-column:auto}.top{margin-bottom:20px}.card{padding:18px;border-radius:16px}.btn{flex:1;min-width:130px}}
  </style></head><body><main class="shell"><header class="top"><div><p class="eyebrow">Antojitos · acceso privado</p><h1 class="title">Panel de control</h1><p class="subtitle">Gestiona el bot sin enviar comandos al chat de tus clientes.</p></div><div class="mark">🍓</div></header><div class="grid"><section class="card wide"><h2>Acceso seguro</h2><p class="hint">El token solo permanece en esta pestaña y se envía por HTTPS.</p><label class="label" for="token">Token administrativo</label><input class="input" id="token" type="password" autocomplete="off" placeholder="Introduce tu token"><div class="row" style="margin-top:12px"><button class="btn secondary" onclick="status()">Consultar estado</button></div><div class="status"><span id="dot" class="dot"></span><span id="statusText">Sin consultar</span></div><pre id="result" class="result" aria-live="polite"></pre></section><section class="card"><h2>Horario de hoy</h2><p class="hint">Abre o cierra el servicio excepcionalmente.</p><div class="row"><button class="btn" onclick="command('!horario on')">Abrir hoy</button><button class="btn danger" onclick="command('!horario off')">Cerrar hoy</button></div></section><section class="card"><h2>Una conversación</h2><p class="hint">Pausa solo el chat seleccionado cuando intervenga una persona.</p><label class="label" for="phone">Teléfono del cliente</label><input class="input" id="phone" inputmode="tel" placeholder="573044490607"><div class="row" style="margin-top:12px"><button class="btn" onclick="command('!bot on')">Reanudar</button><button class="btn danger" onclick="command('!bot off')">Pausar</button></div></section></div><p class="footer">No compartas este enlace ni tu token. Cierra la pestaña al terminar.</p></main><script>const el=id=>document.getElementById(id);const token=()=>el('token').value;async function call(path,body){el('statusText').textContent='Procesando…';el('dot').className='dot';try{const r=await fetch(path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token(),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const j=await r.json();el('result').textContent=JSON.stringify(j,null,2);el('statusText').textContent=r.ok?'Operación completada':'No autorizado o solicitud inválida';el('dot').className='dot '+(r.ok?'ok':'')}catch(e){el('statusText').textContent='No se pudo conectar';el('result').textContent='Revisa tu conexión y vuelve a intentar.'}}function command(command){const phone=el('phone').value.trim();call('/api/admin/command',{command,phoneNumber:phone||undefined})}function status(){call('/api/admin/status')}</script></body></html>`);
});

app.get('/api/admin/status', async (req, res) => {
  if (!isAdminRequest(req)) { res.status(401).json({ error: 'No autorizado' }); return; }
  const checks = [
    { id: 'provider', label: 'Proveedor WhatsApp seleccionado', ok: Boolean(ENV.WHATSAPP_PROVIDER && ENV.WHATSAPP_PROVIDER !== 'simulator'), detail: ENV.WHATSAPP_PROVIDER === 'evolution_api' ? 'Evolution API' : ENV.WHATSAPP_PROVIDER },
    { id: 'evolution-url', label: 'URL de Evolution API', ok: ENV.WHATSAPP_PROVIDER !== 'evolution_api' || Boolean(ENV.EVOLUTION_API_URL), detail: ENV.EVOLUTION_API_URL ? 'Configurada' : 'Falta EVOLUTION_API_URL' },
    { id: 'evolution-key', label: 'Clave de Evolution API', ok: ENV.WHATSAPP_PROVIDER !== 'evolution_api' || Boolean(ENV.EVOLUTION_API_KEY), detail: ENV.EVOLUTION_API_KEY ? 'Configurada' : 'Falta EVOLUTION_API_KEY' },
    { id: 'evolution-instance', label: 'Instancia de WhatsApp', ok: ENV.WHATSAPP_PROVIDER !== 'evolution_api' || Boolean(ENV.EVOLUTION_API_INSTANCE), detail: ENV.EVOLUTION_API_INSTANCE ? `Instancia ${ENV.EVOLUTION_API_INSTANCE}` : 'Falta conectar el número y configurar EVOLUTION_API_INSTANCE' },
    { id: 'redis', label: 'Redis compartido', ok: container.cacheService.getStatus() === 'connected', detail: container.cacheService.getStatus() === 'connected' ? 'Conectado' : 'No conectado: configura REDIS_URL de Upstash' },
    { id: 'database', label: 'Base de datos permanente', ok: ENV.DATABASE_PROVIDER === 'postgres' && Boolean(ENV.DATABASE_URL), detail: ENV.DATABASE_PROVIDER === 'postgres' ? 'PostgreSQL configurado' : 'Revisar DATABASE_PROVIDER' },
    { id: 'ai', label: 'Proveedor de IA', ok: ENV.AI_PROVIDER === 'mock' || Boolean(ENV.OPENAI_API_KEY || ENV.GEMINI_API_KEY), detail: ENV.AI_PROVIDER === 'openai' ? `OpenAI · ${ENV.OPENAI_MODEL}` : ENV.AI_PROVIDER }
  ];
  let dashboard = { todayOrders: 0, attentionOrders: 0, lastHourOrders: 0, activeHumanPauses: 0 };
  try {
    if (ENV.DATABASE_PROVIDER === 'postgres' && ENV.DATABASE_URL) {
      const result = await getPostgresPool().query<{ todayOrders: string; attentionOrders: string; lastHourOrders: string; activeHumanPauses: string }>(`
        SELECT
          (SELECT COUNT(*) FROM bot_orders WHERE created_at >= CURRENT_DATE AND created_at < CURRENT_DATE + INTERVAL '1 day')::int AS "todayOrders",
          (SELECT COUNT(*) FROM bot_orders WHERE COALESCE(payload->>'status','DRAFT') NOT IN ('CANCELLED','DELIVERED'))::int AS "attentionOrders",
          (SELECT COUNT(*) FROM bot_orders WHERE created_at >= NOW() - INTERVAL '1 hour')::int AS "lastHourOrders",
          (SELECT COUNT(*) FROM bot_conversations WHERE (human_pause_until > NOW() OR bot_paused_indefinitely = TRUE))::int AS "activeHumanPauses"
      `);
      const row = result.rows[0];
      if (row) dashboard = {
        todayOrders: Number(row.todayOrders),
        attentionOrders: Number(row.attentionOrders),
        lastHourOrders: Number(row.lastHourOrders),
        activeHumanPauses: Number(row.activeHumanPauses)
      };
    }
  } catch { /* El estado operativo sigue disponible aunque falle una métrica secundaria. */ }
  const schedule = container.operatingSchedule.getStatus();
  res.json({
    ready: checks.every(check => check.ok), checks, schedule,
    state: { kind: schedule.open ? 'active' : 'off_hours', label: schedule.open ? 'Activo' : 'Fuera de horario' },
    dashboard, metrics: container.observability.getSnapshot()
  });
});

app.get('/api/admin/branding', async (req, res) => {
  if (!isAdminRequest(req)) { res.status(401).json({ error: 'No autorizado' }); return; }
  try {
    if (ENV.DATABASE_PROVIDER !== 'postgres' || !ENV.DATABASE_URL) throw new Error('Base de datos no disponible');
    const result = await getPostgresPool().query<{ value: { logoDataUrl?: string } }>(
      'SELECT value FROM admin_settings WHERE key = $1', ['branding']
    );
    res.json({ logoDataUrl: result.rows[0]?.value?.logoDataUrl ?? null });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : 'No se pudo cargar la marca' }); }
});

app.put('/api/admin/branding/logo', async (req, res) => {
  if (!isAdminRequest(req)) { res.status(401).json({ error: 'No autorizado' }); return; }
  try {
    const logoDataUrl = typeof req.body?.logoDataUrl === 'string' ? req.body.logoDataUrl : '';
    const match = logoDataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) throw new Error('El logo debe ser PNG, JPG o WebP');
    if (logoDataUrl.length > 1_500_000) throw new Error('El logo no puede superar 1 MB');
    if (ENV.DATABASE_PROVIDER !== 'postgres' || !ENV.DATABASE_URL) throw new Error('Base de datos no disponible');
    const db = getPostgresPool();
    await db.query(`INSERT INTO admin_settings (key,value,updated_at) VALUES ($1,$2::jsonb,NOW())
      ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()`,
      ['branding', JSON.stringify({ logoDataUrl })]);
    await db.query('INSERT INTO admin_audit_log (id,action,resource_type,resource_id,metadata) VALUES ($1,$2,$3,$4,$5)',
      [crypto.randomUUID(), 'update', 'branding', 'logo', JSON.stringify({ mimeType: match[1] })]);
    res.json({ ok: true, logoDataUrl });
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo guardar el logo' }); }
});

app.delete('/api/admin/branding/logo', async (req, res) => {
  if (!isAdminRequest(req)) { res.status(401).json({ error: 'No autorizado' }); return; }
  try {
    if (ENV.DATABASE_PROVIDER !== 'postgres' || !ENV.DATABASE_URL) throw new Error('Base de datos no disponible');
    const db = getPostgresPool();
    await db.query('DELETE FROM admin_settings WHERE key = $1', ['branding']);
    await db.query('INSERT INTO admin_audit_log (id,action,resource_type,resource_id,metadata) VALUES ($1,$2,$3,$4,$5)',
      [crypto.randomUUID(), 'delete', 'branding', 'logo', JSON.stringify({ reset: true })]);
    res.json({ ok: true, logoDataUrl: null });
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo restablecer el logo' }); }
});

function adminDatabase() {
  if (ENV.DATABASE_PROVIDER !== 'postgres' || !ENV.DATABASE_URL) {
    throw new Error('La gestión administrativa requiere PostgreSQL configurado');
  }
  return getPostgresPool();
}

registerOperationsRoutes(app, isAdminRequest, adminDatabase);

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 160) {
    throw new Error(`${field} es obligatorio`);
  }
  return value.trim();
}

function nonNegativeNumber(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${field} debe ser un número válido`);
  return parsed;
}

app.get('/api/admin/catalog', async (req, res) => {
  if (!isAdminRequest(req)) { res.status(401).json({ error: 'No autorizado' }); return; }
  try {
    const db = adminDatabase();
    const [products, ingredients] = await Promise.all([
      db.query(`SELECT p.id, p.name, p.category, p.description, p.active,
          COALESCE(jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'salePriceCents',v.sale_price_cents,'active',v.active)
          ORDER BY v.name) FILTER (WHERE v.id IS NOT NULL), '[]'::jsonb) AS variants
        FROM catalog_products p LEFT JOIN catalog_product_variants v ON v.product_id=p.id
        GROUP BY p.id ORDER BY p.category, p.name`),
      db.query(`SELECT id,name,unit,quantity,minimum_quantity AS "minimumQuantity",
          cost_per_unit_cents AS "costPerUnitCents",active
        FROM inventory_ingredients ORDER BY name`)
    ]);
    res.json({ products: products.rows, ingredients: ingredients.rows });
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : 'Base de datos no disponible' });
  }
});

app.post('/api/admin/products', async (req, res) => {
  if (!isAdminRequest(req)) { res.status(401).json({ error: 'No autorizado' }); return; }
  try {
    const name = requiredText(req.body?.name, 'name');
    const category = requiredText(req.body?.category, 'category');
    const description = typeof req.body?.description === 'string' ? req.body.description.trim().slice(0, 500) : '';
    const id = crypto.randomUUID();
    const db = adminDatabase();
    await db.query('INSERT INTO catalog_products (id,name,category,description) VALUES ($1,$2,$3,$4)', [id, name, category, description]);
    await db.query('INSERT INTO admin_audit_log (id,action,resource_type,resource_id,metadata) VALUES ($1,$2,$3,$4,$5)', [crypto.randomUUID(), 'create', 'product', id, JSON.stringify({ name, category })]);
    res.status(201).json({ ok: true, id });
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo crear el producto' }); }
});

app.post('/api/admin/variants', async (req, res) => {
  if (!isAdminRequest(req)) { res.status(401).json({ error: 'No autorizado' }); return; }
  try {
    const productId = requiredText(req.body?.productId, 'productId');
    const name = requiredText(req.body?.name, 'name');
    const salePriceCents = Math.round(nonNegativeNumber(req.body?.salePriceCents, 'salePriceCents'));
    const id = crypto.randomUUID();
    const db = adminDatabase();
    await db.query('INSERT INTO catalog_product_variants (id,product_id,name,sale_price_cents) VALUES ($1,$2,$3,$4)', [id, productId, name, salePriceCents]);
    await db.query('INSERT INTO admin_audit_log (id,action,resource_type,resource_id,metadata) VALUES ($1,$2,$3,$4,$5)', [crypto.randomUUID(), 'create', 'variant', id, JSON.stringify({ productId, name, salePriceCents })]);
    res.status(201).json({ ok: true, id });
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo crear la variante' }); }
});

app.post('/api/admin/ingredients', async (req, res) => {
  if (!isAdminRequest(req)) { res.status(401).json({ error: 'No autorizado' }); return; }
  try {
    const name = requiredText(req.body?.name, 'name');
    const unit = requiredText(req.body?.unit, 'unit');
    if (!['unit', 'gram', 'milliliter', 'portion'].includes(unit)) throw new Error('unit no permitida');
    const quantity = nonNegativeNumber(req.body?.quantity ?? 0, 'quantity');
    const minimumQuantity = nonNegativeNumber(req.body?.minimumQuantity ?? 0, 'minimumQuantity');
    const costPerUnitCents = Math.round(nonNegativeNumber(req.body?.costPerUnitCents ?? 0, 'costPerUnitCents'));
    const id = crypto.randomUUID();
    const db = adminDatabase();
    await db.query(`INSERT INTO inventory_ingredients (id,name,unit,quantity,minimum_quantity,cost_per_unit_cents)
      VALUES ($1,$2,$3,$4,$5,$6)`, [id, name, unit, quantity, minimumQuantity, costPerUnitCents]);
    await db.query('INSERT INTO admin_audit_log (id,action,resource_type,resource_id,metadata) VALUES ($1,$2,$3,$4,$5)', [crypto.randomUUID(), 'create', 'ingredient', id, JSON.stringify({ name, unit })]);
    res.status(201).json({ ok: true, id });
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo crear el ingrediente' }); }
});

app.post('/api/admin/recipes', async (req, res) => {
  if (!isAdminRequest(req)) { res.status(401).json({ error: 'No autorizado' }); return; }
  try {
    const variantId = requiredText(req.body?.variantId, 'variantId');
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length || items.length > 100) throw new Error('La receta debe tener entre 1 y 100 ingredientes');
    const db = adminDatabase();
    await db.query('BEGIN');
    try {
      await db.query('DELETE FROM product_recipe_items WHERE variant_id=$1', [variantId]);
      for (const item of items) {
        const ingredientId = requiredText(item?.ingredientId, 'ingredientId');
        const quantity = nonNegativeNumber(item?.quantity, 'quantity');
        if (quantity <= 0) throw new Error('quantity debe ser mayor que cero');
        await db.query('INSERT INTO product_recipe_items (variant_id,ingredient_id,quantity) VALUES ($1,$2,$3)', [variantId, ingredientId, quantity]);
      }
      await db.query('COMMIT');
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    await db.query('INSERT INTO admin_audit_log (id,action,resource_type,resource_id,metadata) VALUES ($1,$2,$3,$4,$5)', [crypto.randomUUID(), 'replace', 'recipe', variantId, JSON.stringify({ itemCount: items.length })]);
    res.json({ ok: true, variantId, itemCount: items.length });
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo guardar la receta' }); }
});

app.post('/api/admin/command', async (req, res) => {
  if (!isAdminRequest(req)) { res.status(401).json({ error: 'No autorizado' }); return; }
  const command = typeof req.body?.command === 'string' ? req.body.command.trim().toLowerCase() : '';
  const phone = typeof req.body?.phoneNumber === 'string' ? req.body.phoneNumber.replace(/\D/g, '') : '';
  const pauseMinutes = req.body?.pauseMinutes === undefined ? undefined : Number(req.body.pauseMinutes);
  if (command === '!horario on' || command === '!horario abrir' || command === '!horario off' || command === '!horario cerrar') {
    const handled = container.operatingSchedule.handleOperatorCommand(command);
    res.json({ ok: handled, schedule: container.operatingSchedule.getStatus() });
    return;
  }
  if (command === '!bot off' && phone && pauseMinutes !== undefined) {
    if (!Number.isInteger(pauseMinutes) || pauseMinutes < 1 || pauseMinutes > 1440) {
      res.status(400).json({ error: 'La duración debe ser un entero entre 1 y 1440 minutos' });
      return;
    }
    const pauseUntil = await container.coexistenceService.pauseConversation(phone, pauseMinutes);
    res.json({ ok: true, phone: `***${phone.slice(-4)}`, pauseMinutes, pauseUntil: pauseUntil.toISOString() });
    return;
  }
  if ((command === '!bot on' || command === '!bot off') && phone) {
    const handled = await container.coexistenceService.handleCommand(phone, command);
    res.json({ ok: handled, phone: `***${phone.slice(-4)}`, pauseMinutes: command === '!bot off' ? ENV.COEXISTENCE_COOLDOWN_MINUTES : 0 });
    return;
  }
  res.status(400).json({ error: 'Comando inválido o teléfono requerido para !bot on/off' });
});

// Public legal pages required by Meta app review. Keep these routes free of
// authentication so Meta can fetch them during the review process.
app.get('/politica-privacidad', (_req, res) => {
  res.type('html').send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Política de privacidad - Josmar</title></head><body><main><h1>Política de privacidad</h1><p>Última actualización: 26 de octubre de 2026.</p><p>Josmar trata los datos recibidos mediante WhatsApp únicamente para gestionar conversaciones, pedidos, soporte y funcionamiento del servicio solicitado por el usuario.</p><h2>Datos tratados</h2><p>Podemos tratar nombre, número de teléfono, mensajes, dirección de entrega y datos del pedido. No vendemos datos personales.</p><h2>Conservación y seguridad</h2><p>Conservamos la información solo durante el tiempo necesario para prestar el servicio y aplicamos controles de acceso y medidas técnicas razonables.</p><h2>Derechos y contacto</h2><p>Para consultar, corregir o eliminar tus datos, escribe a <a href="mailto:privacidad@josmar.com.co">privacidad@josmar.com.co</a>.</p></main></body></html>`);
});

app.get('/eliminacion-datos', (_req, res) => {
  res.type('html').send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Eliminación de datos - Josmar</title></head><body><main><h1>Solicitud de eliminación de datos</h1><p>Última actualización: 26 de octubre de 2026.</p><p>Para solicitar la eliminación de los datos asociados a tu número de WhatsApp, envía un correo a <a href="mailto:privacidad@josmar.com.co">privacidad@josmar.com.co</a> indicando el número usado y la solicitud “Eliminar mis datos”.</p><p>Verificaremos la titularidad y eliminaremos o anonimizaremos la información que no debamos conservar por obligación legal. Te confirmaremos el resultado por correo.</p></main></body></html>`);
});

// Endpoint para consultar órdenes registradas
app.get('/api/orders', async (req, res) => {
  if (!isAdminRequest(req)) {
    res.status(ENV.ADMIN_API_TOKEN && ENV.ADMIN_ALLOWED_PHONES.length ? 401 : 503).json({ error: 'Endpoint administrativo no disponible' });
    return;
  }
  const orders = await container.orderRepository.listAll();
  res.json({
    total: orders.length,
    orders: orders.map(o => ({
      id: o.id,
      cliente: o.customer.name,
      telefono: o.customer.phoneNumber,
      direccion: o.customer.getFullAddress(),
      total: o.getTotal().amount,
      metodo_pago: o.paymentMethod,
      nequi_ref: o.nequiReference,
      estado: o.status.value,
      fecha: o.createdAt
    }))
  });
});

// Webhook de WhatsApp (soporta /webhook y /api/v1/webhook)
app.get(['/webhook', '/api/v1/webhook'], (req, res) => webhookController.verify(req, res));
app.post(['/webhook', '/api/v1/webhook'], (req, res) => webhookController.handleWebhook(req, res));

app.use((_req, res) => {
  res.status(404).json({ error: 'Recurso no encontrado' });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error no controlado en HTTP:', error instanceof Error ? error.message : 'unknown');
  res.status(500).json({ error: 'Error interno del servidor' });
});

const server = app.listen(ENV.PORT, '0.0.0.0', () => {
  console.log(`🍓 AntojitosBot Servidor activo en el puerto ${ENV.PORT}`);
  console.log(`🤖 AI Provider: ${ENV.AI_PROVIDER}`);
  console.log(`📱 WhatsApp Provider: ${ENV.WHATSAPP_PROVIDER}`);
  console.log(`🔗 Webhook path: /webhook`);
});

async function shutdown(): Promise<void> {
  server.close(async (error) => {
    if (error) {
      console.error('Error cerrando el servidor:', error);
      process.exitCode = 1;
    }
    await closePostgresPool();
  });
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
