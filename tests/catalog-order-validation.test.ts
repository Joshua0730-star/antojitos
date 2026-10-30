import { describe, expect, it, vi } from 'vitest';
import { ToolExecutor } from '../src/infrastructure/ai/ToolExecutor.js';
import { GetCatalogUseCase } from '../src/application/use-cases/GetCatalogUseCase.js';

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
});
