import { describe, expect, it } from 'vitest';
import { createOrderFsm } from '../src/domain/fsm/orderFsm.js';

describe('Antojitos order FSM', () => {
  it('recorre el flujo principal con slots, carrito, domicilio y pago', () => {
    const fsm = createOrderFsm();
    expect(fsm.transition({ type: 'MESSAGE', text: 'Hola, quiero pedir' }).session.state).toBe('EXPLORING_MENU');
    const product = fsm.transition({ type: 'MESSAGE', text: 'Regálame una de 12' });
    expect(product.session.state).toBe('CONFIGURING_PRODUCT');
    expect(product.session.cart[0]).toMatchObject({ sizeOz: 12, unitPrice: 16000 });
    expect(fsm.transition({ type: 'MESSAGE', text: 'continuemos con la entrega' }).session.state).toBe('COLLECTING_DELIVERY');
    const delivery = fsm.transition({ type: 'SET_DELIVERY', data: { customerName: 'Ana', address: 'Calle 9 #4-11', neighborhood: 'Centro' } });
    expect(delivery.session.state).toBe('PAYMENT');
    const payment = fsm.transition({ type: 'MESSAGE', text: 'Daviplata' });
    expect(payment.session.state).toBe('CONFIRMATION');
    expect(payment.session.payment?.method).toBe('DAVIPLATA');
  });

  it('interpreta grande y cambia el producto anterior sin duplicarlo', () => {
    const fsm = createOrderFsm();
    fsm.transition({ type: 'MESSAGE', text: 'una de 12' });
    const changed = fsm.transition({ type: 'MESSAGE', text: 'cámbiamela por una grande' });
    expect(changed.session.cart).toHaveLength(1);
    expect(changed.session.cart[0].sizeOz).toBe(16);
  });

  it('responde FAQ y vuelve a engancharse al estado pendiente', () => {
    const fsm = createOrderFsm();
    fsm.transition({ type: 'MESSAGE', text: 'regálame una de 12' });
    const faq = fsm.transition({ type: 'MESSAGE', text: '¿hasta qué hora abren?' });
    expect(faq.session.state).toBe('CONFIGURING_PRODUCT');
    expect(faq.session.interruptionStack).toEqual(['CONFIGURING_PRODUCT']);
    expect(faq.reply).toMatch(/horario/i);
    expect(faq.reply).toContain('toppings');
  });

  it('entiende centro como barrio y produce un re-hook de entrega', () => {
    const fsm = createOrderFsm();
    fsm.transition({ type: 'MESSAGE', text: 'una grande' });
    fsm.transition({ type: 'MESSAGE', text: 'listo, entrega' });
    const result = fsm.transition({ type: 'MESSAGE', text: 'al centro' });
    expect(result.session.state).toBe('COLLECTING_DELIVERY');
    expect(result.session.delivery.neighborhood).toBe('Centro');
    expect(result.reply).toContain('nombre');
  });

  it('rechaza transiciones inválidas y no muta el estado previo', () => {
    const fsm = createOrderFsm();
    const result = fsm.transition({ type: 'SET_PAYMENT', method: 'NEQUI' });
    expect(result.accepted).toBe(false);
    expect(result.session.state).toBe('IDLE');
    expect(result.session.cart).toHaveLength(0);
  });

  it('activa handoff tras dos mensajes no interpretables', () => {
    const fsm = createOrderFsm();
    fsm.transition({ type: 'MESSAGE', text: 'xyz' });
    const result = fsm.transition({ type: 'MESSAGE', text: 'abc' });
    expect(result.session.state).toBe('HANDOFF');
    expect(result.reply).toContain('asesor');
  });

  it('permite handoff explícito desde cualquier estado', () => {
    const fsm = createOrderFsm();
    const result = fsm.transition({ type: 'MESSAGE', text: 'quiero hablar con una persona' });
    expect(result.session.state).toBe('HANDOFF');
  });
});
