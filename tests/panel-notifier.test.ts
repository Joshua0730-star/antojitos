import { describe, expect, it, vi } from 'vitest';
import { Order } from '../src/domain/entities/Order.js';
import { OrderItem } from '../src/domain/entities/OrderItem.js';
import { Customer } from '../src/domain/entities/Customer.js';
import { PanelOrderNotifier, PanelOrderNotifierOptions } from '../src/infrastructure/http/PanelOrderNotifier.js';
import { PanelOrderNotifierError } from '../src/application/ports/IPanelOrderNotifier.js';

function makeOrder(): Order {
  return new Order({
    id: 'ANT-20261030-8942',
    createdAt: new Date('2026-10-30T17:49:00.000Z'),
    customer: new Customer({
      phoneNumber: '573001234567',
      name: 'Carlos Mendoza',
      deliveryType: 'DOMICILIO',
      address: 'Calle 9 #4-11',
      neighborhoodOrMunicipality: 'Centro',
      addressDetails: 'Casa con reja verde cerca a la plaza'
    }),
    items: [new OrderItem({
      productId: 'fresas_16oz',
      productName: 'Fresas con Crema 16 oz',
      category: 'Fresas',
      basePrice: 20_000,
      quantity: 1,
      toppings: ['Brownie', 'Oreo'],
      sauce: 'Arequipe'
    })],
    paymentMethod: 'NEQUI'
  });
}

function response(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function notifier(overrides: Partial<PanelOrderNotifierOptions> = {}): PanelOrderNotifier {
  return new PanelOrderNotifier({
    baseUrl: 'https://panel.example.com/',
    sleep: vi.fn().mockResolvedValue(undefined),
    random: () => 0.5,
    ...overrides
  });
}

describe('PanelOrderNotifier', () => {
  it('convierte una orden al contrato del panel y publica con idempotencia', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(201, { received: true }));
    const result = await notifier({ fetch: fetchMock, deliveryFee: 3_000 }).publish(makeOrder());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(init.body));

    expect(url).toBe('https://panel.example.com/api/v1/orders');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('ANT-20261030-8942');
    expect((init.headers as Record<string, string>)['X-Order-Id']).toBe('ANT-20261030-8942');
    expect(payload).toMatchObject({
      order_id: 'ANT-20261030-8942',
      customer: { phone: '+573001234567', name: 'Carlos Mendoza' },
      delivery: { type: 'DOMICILIO', address: 'Calle 9 #4-11', neighborhood: 'Centro', municipality: 'Pueblo Bello', department: 'Cesar' },
      financials: { subtotal: 20_000, delivery_fee: 3_000, total: 23_000, payment_method: 'NEQUI', payment_status: 'PENDIENTE_VERIFICACION' },
      source: 'WHATSAPP_BOT',
      status: 'NUEVO_PEDIDO'
    });
    expect(payload.items[0]).toEqual({
      product_name: 'Fresas con Crema 16 oz', quantity: 1, unit_price: 20_000,
      toppings: ['Brownie', 'Oreo'], sauces: ['Arequipe'], subtotal: 20_000
    });
    expect(result).toMatchObject({ orderId: 'ANT-20261030-8942', attempts: 1, status: 201 });
  });

  it('reintenta errores 5xx con backoff y jitter inyectables', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(503, { error: 'down' }))
      .mockResolvedValueOnce(response(502, { error: 'still down' }))
      .mockResolvedValueOnce(response(201));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await notifier({ fetch: fetchMock, sleep, random: () => 0.5, retryBaseDelayMs: 100 }).publish(makeOrder());

    expect(result.attempts).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 50);
    expect(sleep).toHaveBeenNthCalledWith(2, 100);
  });

  it('no reintenta errores 4xx y conserva el cuerpo de error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(422, { error: 'invalid order' }));

    await expect(notifier({ fetch: fetchMock }).publish(makeOrder())).rejects.toMatchObject<Partial<PanelOrderNotifierError>>({
      kind: 'client', status: 422, attempts: 1, responseBody: { error: 'invalid order' }
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reintenta errores de red y finalmente distingue el fallo', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('socket closed'));

    await expect(notifier({ fetch: fetchMock, maxAttempts: 2 }).publish(makeOrder())).rejects.toMatchObject({
      kind: 'network', attempts: 2
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('clasifica un timeout producido por AbortController', async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      })
    );

    await expect(notifier({ fetch: fetchMock, timeoutMs: 1, maxAttempts: 1 }).publish(makeOrder())).rejects.toMatchObject({
      kind: 'timeout', attempts: 1
    });
  });
});
