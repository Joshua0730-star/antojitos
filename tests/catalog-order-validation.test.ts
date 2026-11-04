import { describe, expect, it, vi } from 'vitest';
import { ToolExecutor } from '../src/infrastructure/ai/ToolExecutor.js';
import { GetCatalogUseCase } from '../src/application/use-cases/GetCatalogUseCase.js';
import { MockVisionService } from '../src/infrastructure/vision/MockVisionService.js';
import { ValidateNequiReceiptUseCase } from '../src/application/use-cases/ValidateNequiReceiptUseCase.js';

describe('Validación determinista de productos antes de cocina', () => {
  const executor = new ToolExecutor(
    new GetCatalogUseCase(),
    { execute: vi.fn() } as any,
    { execute: vi.fn().mockResolvedValue({ enviado: true, orden_id: 'ANT-TEST' }) } as any
  );

  const base = (item: any) => ({
    cliente: { nombre: 'Cliente', telefono: '573001234567', tipo_entrega: 'RECOGER_EN_LOCAL' },
    items: [item],
    metodo_pago: 'EFECTIVO'
  });

  it('rechaza enviar una oblea con identidad de fresas', async () => {
    await expect(executor.executeTool('notificar_cocina', {
      resumen_pedido_formatted: '',
      detalles_json: base({
        id_producto: 'oblea_especial',
        nombre: 'Fresas con crema',
        precio_base: 12000,
        cantidad: 1
      })
    })).rejects.toThrow(/nombre del producto no coincide/i);
  });

  it('acepta la oblea especial solo con sus datos de catálogo', async () => {
    const result = await executor.executeTool('notificar_cocina', {
      resumen_pedido_formatted: '',
      detalles_json: base({
        id_producto: 'oblea_especial',
        nombre: 'Oblea especial',
        precio_base: 12000,
        cantidad: 1
      })
    });
    expect(result.orden_id).toBe('ANT-TEST');
  });

  it('rechaza pedidos fuera de Pueblo Bello', async () => {
    await expect(executor.executeTool('notificar_cocina', {
      resumen_pedido_formatted: '',
      detalles_json: {
        ...base({
          id_producto: 'oblea_especial',
          nombre: 'Oblea especial',
          precio_base: 12000,
          cantidad: 1
        }),
        cliente: {
          ...base({}).cliente,
          tipo_entrega: 'DOMICILIO',
          municipio: 'Valledupar',
          direccion: 'Calle 1 #2-3',
          barrio_municipio: 'Centro'
        }
      }
    })).rejects.toThrow(/Pueblo Bello/i);
  });

  it('calcula subtotal, domicilio y total desde el catálogo', async () => {
    const result = await executor.executeTool('calcular_total_pedido', {
      detalles_json: {
        cliente: {
          nombre: 'Cliente',
          telefono: '573001234567',
          tipo_entrega: 'DOMICILIO',
          direccion: 'Calle 1 #2-3',
          barrio_municipio: 'Centro'
        },
        items: [{
          id_producto: 'fresas_crema_std',
          nombre: 'Fresas con crema',
          precio_base: 13000,
          cantidad: 1,
          tamano: { nombre: '12 onzas', adicional: 5000 },
          salsa: 'Fresa',
          toppings: ['Queso']
        }],
        metodo_pago: 'NEQUI'
      }
    });

    expect(result).toEqual({ subtotal: 18000, delivery_fee: 2000, total: 20000, currency: 'COP' });
  });

  it('ignora un monto manipulado y valida el comprobante contra la orden persistida', async () => {
    const vision = new MockVisionService();
    const receipts = { saveIfReferenceUnused: vi.fn().mockResolvedValue(true) };
    const persistedOrder = {
      paymentMethod: 'NEQUI',
      status: { value: 'PENDING_PAYMENT' },
      getTotal: () => ({ amount: 22000 })
    };
    const executorWithOrder = new ToolExecutor(
      new GetCatalogUseCase(),
      new ValidateNequiReceiptUseCase(vision, receipts as any),
      { execute: vi.fn() } as any,
      undefined,
      { findById: vi.fn().mockResolvedValue(persistedOrder) } as any
    );

    const result = await executorWithOrder.executeTool('validar_comprobante_nequi', {
      image_url: 'comprobante_16000',
      monto_esperado: 16000,
      order_id: 'ANT-PERSISTED-1'
    });

    expect(result.exito).toBe(false);
    expect(result.mensaje).toContain('$22.000');
  });
});
