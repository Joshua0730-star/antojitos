import { describe, it, expect } from 'vitest';
import { createContainer } from '../src/infrastructure/di/container.js';
import { SimulatorWhatsAppAdapter } from '../src/infrastructure/whatsapp/SimulatorWhatsAppAdapter.js';

describe('ProcessIncomingMessageUseCase: Reglas de Comportamiento', () => {
  it('rechaza llamadas de voz entrantes con el mensaje exacto de la especificación', async () => {
    const simulatorAdapter = new SimulatorWhatsAppAdapter();
    const container = createContainer({ whatsAppService: simulatorAdapter });

    const result = await container.processIncomingMessageUseCase.execute({
      from: '+573001234567',
      isCallEvent: true
    });

    expect(result.isCallRejection).toBe(true);
    expect(result.replyMessage).toBe(
      '¡Hola! Por llamadas no podemos tomar tu pedido de manera rápida. ¡Por aquí por chat te atendemos de inmediato! 🍓'
    );

    const outbox = simulatorAdapter.getOutbox();
    expect(outbox.length).toBe(1);
    expect(outbox[0].text).toContain('Por llamadas no podemos tomar tu pedido');
  });

  it('permite consultar el catálogo sin errores', () => {
    const container = createContainer();
    const catalog = container.getCatalogUseCase.execute();

    expect(catalog.comercio).toBe('Antojitos');
    expect(catalog.productos.length).toBeGreaterThanOrEqual(3);
    const fresas = catalog.productos.find(p => p.id === 'fresas_crema_std');
    expect(fresas).toBeDefined();
    expect(fresas?.opciones?.toppings?.max_seleccion).toBe(2);
  });
});
