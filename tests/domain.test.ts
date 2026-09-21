import { describe, it, expect } from 'vitest';
import { Customer } from '../src/domain/entities/Customer.js';
import { OrderItem } from '../src/domain/entities/OrderItem.js';
import { Order } from '../src/domain/entities/Order.js';
import { Money } from '../src/domain/value-objects/Money.js';

describe('Domain Layer: Entities & Value Objects', () => {
  it('calcula correctamente el precio unitario y subtotal de un producto con personalizaciones', () => {
    // Fresas Grandes ($12.000 + $4.000 = $16.000) con 2 toppings
    const item = new OrderItem({
      productId: 'fresas_crema_std',
      productName: 'Fresas con Crema Especiales',
      category: 'Fresas',
      basePrice: 12000,
      quantity: 2,
      size: { name: 'Grande', adicional: 4000 },
      toppings: ['ChocoKrispis', 'Queso']
    });

    expect(item.getUnitPrice().amount).toBe(16000);
    expect(item.getSubtotal().amount).toBe(32000);
    expect(item.formatForKitchen()).toContain('2x *Fresas con Crema Especiales* (Grande)');
    expect(item.formatForKitchen()).toContain('Toppings: ChocoKrispis, Queso');
  });

  it('calcula correctamente adiciones extra en una Oblea', () => {
    // Oblea ($7.000) + Doble Queso ($2.000)
    const item = new OrderItem({
      productId: 'oblea_tradicional',
      productName: 'Oblea la Especial',
      category: 'Obleas',
      basePrice: 7000,
      quantity: 1,
      sauce: 'Arequipe',
      extraAdditions: [{ name: 'Doble Queso', additionalPrice: 2000 }]
    });

    expect(item.getUnitPrice().amount).toBe(9000);
    expect(item.getSubtotal().amount).toBe(9000);
  });

  it('calcula el total de la orden y el cambio en efectivo', () => {
    const customer = new Customer({
      name: 'María Camila Pérez',
      phoneNumber: '+57 300 123 4567',
      deliveryType: 'DOMICILIO',
      address: 'Cra 15 # 45-20',
      neighborhoodOrMunicipality: 'Torre B',
      addressDetails: 'Apt 302'
    });

    const item1 = new OrderItem({
      productId: 'fresas_crema_std',
      productName: 'Fresas con Crema Especiales',
      category: 'Fresas',
      basePrice: 12000,
      quantity: 1,
      size: { name: 'Grande', adicional: 4000 },
      toppings: ['ChocoKrispis', 'Queso']
    });

    const item2 = new OrderItem({
      productId: 'oblea_tradicional',
      productName: 'Oblea la Especial',
      category: 'Obleas',
      basePrice: 7000,
      quantity: 1,
      extraAdditions: [{ name: 'Doble Queso', additionalPrice: 2000 }]
    });

    const order = new Order({
      id: 'ANT-8492',
      customer,
      items: [item1, item2],
      paymentMethod: 'EFECTIVO',
      cashBillAmount: 50000
    });

    // Total: 16.000 + 9.000 = 25.000
    expect(order.getTotal().amount).toBe(25000);

    // Cambio: 50.000 - 25.000 = 25.000
    const change = order.calculateChange();
    expect(change?.amount).toBe(25000);

    const kitchenMessage = order.formatForKitchen();
    expect(kitchenMessage).toContain('🚨 *¡NUEVO PEDIDO CONFIRMADO!* 🚨');
    expect(kitchenMessage).toContain('#ANT-8492');
    expect(kitchenMessage).toContain('María Camila Pérez');
    expect(kitchenMessage).toContain('25.000 COP');
    expect(kitchenMessage).toContain('Efectivo contra entrega');
  });

  it('formatea correctamente una orden pagada con Nequi verificado', () => {
    const customer = new Customer({
      name: 'Carlos Ruiz',
      phoneNumber: '+57 311 000 0000',
      deliveryType: 'RECOGER_EN_LOCAL'
    });

    const item = new OrderItem({
      productId: 'ensalada_frutas_clasica',
      productName: 'Ensalada de Frutas Especial',
      category: 'Ensaladas',
      basePrice: 14000,
      quantity: 1,
      iceCreamFlavor: 'Vainilla',
      extraCheese: { name: 'Con extra queso', additional: 1500 }
    });

    const order = new Order({
      id: 'ANT-1234',
      customer,
      items: [item],
      paymentMethod: 'NEQUI',
      nequiReference: 'M98765432'
    });

    order.markAsPaymentVerified('M98765432');

    expect(order.getTotal().amount).toBe(15500);
    const kitchenMsg = order.formatForKitchen();
    expect(kitchenMsg).toContain('Recoger en local');
    expect(kitchenMsg).toContain('Nequi (VERIFICADO ✅)');
    expect(kitchenMsg).toContain('Ref. Nequi:* M98765432');
  });
});
