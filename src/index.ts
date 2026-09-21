import express from 'express';
import { ENV } from './infrastructure/config/env.js';
import { createContainer } from './infrastructure/di/container.js';
import { WhatsAppWebhookController } from './presentation/controllers/WhatsAppWebhookController.js';

const app = express();
app.use(express.json());

// Iniciar inyección de dependencias
const container = createContainer();
const webhookController = new WhatsAppWebhookController(container.processIncomingMessageUseCase);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'AntojitosBot',
    aiProvider: ENV.AI_PROVIDER,
    whatsappProvider: ENV.WHATSAPP_PROVIDER,
    timestamp: new Date().toISOString()
  });
});

// Endpoint para consultar órdenes registradas
app.get('/api/orders', async (req, res) => {
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

// Webhook de WhatsApp
app.get('/webhook', (req, res) => webhookController.verify(req, res));
app.post('/webhook', (req, res) => webhookController.handleWebhook(req, res));

app.listen(ENV.PORT, () => {
  console.log(`🍓 AntojitosBot Servidor activo en http://localhost:${ENV.PORT}`);
  console.log(`🤖 AI Provider: ${ENV.AI_PROVIDER}`);
  console.log(`📱 WhatsApp Provider: ${ENV.WHATSAPP_PROVIDER}`);
  console.log(`🔗 Webhook URL: http://localhost:${ENV.PORT}/webhook`);
});
