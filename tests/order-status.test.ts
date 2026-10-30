import { describe, expect, it } from 'vitest';
import { FileOrderRepository } from '../src/infrastructure/persistence/FileOrderRepository.js';
import { Order } from '../src/domain/entities/Order.js';
import { OrderItem } from '../src/domain/entities/OrderItem.js';
import { Customer } from '../src/domain/entities/Customer.js';
import { IntentRouterService } from '../src/application/services/IntentRouterService.js';

describe('Consulta de pedido por teléfono', () => {
  it('encuentra el último pedido asociado al número que escribe', async () => {
    const repository = new FileOrderRepository();
    const order = new Order({
      id: 'ANT-TEST-001',
      customer: new Customer({ phoneNumber: '573044490607', name: 'Cliente de prueba', deliveryType: 'RECOGER_EN_LOCAL' }),
      items: [new OrderItem({ productId: 'fresas_crema_std', productName: 'Fresas con crema', category: 'Fresas', basePrice: 15000, quantity: 1 })],
      paymentMethod: 'EFECTIVO'
    });
    await repository.save(order);
    const found = await repository.findLatestByPhoneNumber('573044490607');
    expect(found?.id).toBe('ANT-TEST-001');
    expect(await repository.findLatestByPhoneNumber('573000000000')).toBeNull();
  });

  it('reconoce consultas de estado sin exigir un número de pedido', () => {
    const match = new IntentRouterService().routeIntent('quiero saber el estado de mi pedido');
    expect(match?.intent).toBe('order_status');
  });
});
