import { describe, it, expect, beforeEach } from 'vitest';
import { createContainer, AppContainer } from '../src/infrastructure/di/container.js';
import { SimulatorWhatsAppAdapter } from '../src/infrastructure/whatsapp/SimulatorWhatsAppAdapter.js';

import { MockAIService } from '../src/infrastructure/ai/MockAIService.js';
import { MockVisionService } from '../src/infrastructure/vision/MockVisionService.js';

describe('End-to-End Conversation Flow (State Machine: Steps 1 to 6)', () => {
  let container: AppContainer;
  let simulatorAdapter: SimulatorWhatsAppAdapter;
  const customerPhone = '+57 300 555 7788';

  beforeEach(async () => {
    simulatorAdapter = new SimulatorWhatsAppAdapter();
    const mockVisionService = new MockVisionService();
    const tempContainer = createContainer({ whatsAppService: simulatorAdapter, visionService: mockVisionService });
    const mockAiService = new MockAIService(tempContainer.toolExecutor);
    container = createContainer({ whatsAppService: simulatorAdapter, visionService: mockVisionService, aiService: mockAiService });
    await container.conversationRepository.clearConversation(customerPhone);
  });

  it('completa el flujo íntegro de 6 pasos de un pedido con Nequi y notifica a cocina', async () => {
    // PASO 1: Bienvenida e Intención
    const turn1 = await container.processIncomingMessageUseCase.execute({
      from: customerPhone,
      text: '¡Hola! Quiero hacer un pedido.'
    });

    expect(turn1.replied).toBe(true);
    expect(turn1.replyMessage).toContain('Antojitos');
    expect(turn1.replyMessage).toContain('Fresas con Crema Especiales');

    // PASO 2: Selección de producto
    const turn2 = await container.processIncomingMessageUseCase.execute({
      from: customerPhone,
      text: 'Quiero unas fresas con crema especiales'
    });

    expect(turn2.replied).toBe(true);
    expect(turn2.replyMessage).toContain('Personal');
    expect(turn2.replyMessage).toContain('toppings');

    // PASO 2.1: Confirmación de opciones
    const turn3 = await container.processIncomingMessageUseCase.execute({
      from: customerPhone,
      text: 'En tamaño grande con queso y chispas de chocolate'
    });

    expect(turn3.replied).toBe(true);
    expect(turn3.replyMessage).toContain('entrega');

    // PASO 3: Datos de entrega
    const turn4 = await container.processIncomingMessageUseCase.execute({
      from: customerPhone,
      text: 'Para María Camila en Cra 15 # 45-20 Torre B Apt 302, a domicilio por favor'
    });

    expect(turn4.replied).toBe(true);
    expect(turn4.replyMessage).toContain('TOTAL A PAGAR');
    expect(turn4.replyMessage).toContain('Nequi');

    // PASO 4 & 5: Pago con Nequi y Envío de Comprobante
    const turn5 = await container.processIncomingMessageUseCase.execute({
      from: customerPhone,
      text: 'Aquí está mi comprobante de Nequi',
      imageUrl: 'comprobante_nequi_16000.jpg'
    });

    expect(turn5.replied).toBe(true);
    expect(turn5.replyMessage).toMatch(/^✅ Pedido confirmado a nombre de \*Cliente Prueba\*\. Orden #ANT-\d{4}\. 🍓$/);

    // PASO 6: Verificación de despacho a cocina
    const kitchenAlert = simulatorAdapter.getLatestKitchenAlert();
    expect(kitchenAlert).toBeDefined();
    expect(kitchenAlert).toContain('🚨 *¡NUEVO PEDIDO CONFIRMADO!* 🚨');
    expect(kitchenAlert).toContain('Fresas con Crema Especiales');
    expect(kitchenAlert).toContain('Nequi (VERIFICADO ✅)');

    // Verificar que la orden quedó guardada en la base de datos
    const orders = await container.orderRepository.listAll();
    expect(orders.length).toBeGreaterThanOrEqual(1);
    const lastOrder = orders[orders.length - 1];
    expect(lastOrder.nequiVerified).toBe(true);
    expect(lastOrder.status.value).toBe('SENT_TO_KITCHEN');
  }, 30000);
});
