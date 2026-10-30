import { z } from 'zod';

export const OrderState = z.enum([
  'IDLE',
  'EXPLORING_MENU',
  'CONFIGURING_PRODUCT',
  'COLLECTING_DELIVERY',
  'PAYMENT',
  'CONFIRMATION',
  'HANDOFF'
]);
export type OrderState = z.infer<typeof OrderState>;

export const PaymentMethod = z.enum(['NEQUI', 'DAVIPLATA', 'EFECTIVO']);
export type PaymentMethod = z.infer<typeof PaymentMethod>;

const CartItem = z.object({
  productId: z.string().min(1),
  productName: z.string().min(1),
  sizeOz: z.number().int().positive(),
  unitPrice: z.number().int().nonnegative(),
  quantity: z.number().int().positive(),
  toppings: z.array(z.string().min(1)),
  sauces: z.array(z.string().min(1))
});
export type CartItem = z.infer<typeof CartItem>;

const DeliverySlots = z.object({
  customerName: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
  neighborhood: z.string().min(1).optional(),
  municipality: z.string().min(1).default('Pueblo Bello'),
  notes: z.string().min(1).optional()
});
export type DeliverySlots = z.infer<typeof DeliverySlots>;

const PaymentSlots = z.object({
  method: PaymentMethod,
  reference: z.string().min(1).optional(),
  status: z.enum(['PENDING', 'PENDING_VERIFICATION', 'READY_FOR_CONFIRMATION']).default('PENDING')
});
export type PaymentSlots = z.infer<typeof PaymentSlots>;

export const OrderSession = z.object({
  state: OrderState,
  cart: z.array(CartItem),
  delivery: DeliverySlots,
  payment: PaymentSlots.optional(),
  interruptionStack: z.array(OrderState),
  unknownAttempts: z.number().int().min(0).max(2),
  lastPrompt: z.string().optional()
});
export type OrderSession = z.infer<typeof OrderSession>;

export const OrderEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('MESSAGE'), text: z.string().trim().min(1) }),
  z.object({ type: z.literal('ADD_PRODUCT'), sizeOz: z.number().int().positive(), quantity: z.number().int().positive().default(1), toppings: z.array(z.string()).default([]), sauces: z.array(z.string()).default([]) }),
  z.object({ type: z.literal('SET_DELIVERY'), data: DeliverySlots.partial() }),
  z.object({ type: z.literal('SET_PAYMENT'), method: PaymentMethod, reference: z.string().min(1).optional() }),
  z.object({ type: z.literal('CONFIRM') }),
  z.object({ type: z.literal('HANDOFF'), reason: z.string().min(1) })
]);
export type OrderEvent = z.infer<typeof OrderEvent>;

export interface TransitionResult {
  session: OrderSession;
  accepted: boolean;
  reply: string;
  event: OrderEvent;
}

const SIZE_PRICES: Record<number, number> = { 9: 12000, 12: 16000, 16: 20000, 24: 28000 };
const SIZE_LABELS: Record<number, string> = { 9: 'pequeña', 12: 'mediana', 16: 'grande', 24: 'familiar' };

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function cloneSession(session: OrderSession): OrderSession {
  return OrderSession.parse({
    ...session,
    cart: session.cart.map(item => ({ ...item, toppings: [...item.toppings], sauces: [...item.sauces] })),
    delivery: { ...session.delivery },
    payment: session.payment ? { ...session.payment } : undefined,
    interruptionStack: [...session.interruptionStack]
  });
}

function initialSession(): OrderSession {
  return OrderSession.parse({
    state: 'IDLE',
    cart: [],
    delivery: { municipality: 'Pueblo Bello' },
    interruptionStack: [],
    unknownAttempts: 0
  });
}

function productPrompt(item: CartItem): string {
  return `Anoté ${item.productName} de ${item.sizeOz} oz. ¿Deseas agregar toppings o salsas, o continuamos con la entrega?`;
}

function missingDelivery(delivery: DeliverySlots): string[] {
  return [
    ['customerName', 'tu nombre'],
    ['address', 'la dirección exacta'],
    ['neighborhood', 'el barrio']
  ].filter(([key]) => !delivery[key as keyof DeliverySlots]).map(([, label]) => label);
}

function faqReply(text: string): string | null {
  const value = normalize(text);
  if (/(horario|hora|abren|cierran)/.test(value)) return 'Horario: atendemos de lunes a sábado de 1:00 PM a 9:00 PM y domingos/festivos de 2:00 PM a 8:30 PM.';
  if (/(donde|ubicacion|direccion del local)/.test(value)) return 'Estamos en Pueblo Bello, Cesar. También hacemos domicilios a los barrios del municipio.';
  if (/(metodos? de pago|formas? de pago|como puedo pagar|reciben (nequi|daviplata|efectivo))/.test(value)) return 'Puedes pagar con Nequi, Daviplata o efectivo contra entrega.';
  return null;
}

function detectedSize(text: string): number | undefined {
  const value = normalize(text);
  // Local shorthand: “una de 12” means 12 oz even when the customer omits
  // “oz”. Keep the accepted sizes explicit so arbitrary numbers never become
  // catalog values.
  const ounces = value.match(/(?:de\s*)?(9|12|16|24)\s*(?:oz|onzas?)?\b/);
  if (ounces) return Number(ounces[1]);
  const colloquial = value.match(/\b(?:de|una?)\s*(9|12|16|24)\b/);
  if (colloquial) return Number(colloquial[1]);
  if (/\b(grande|grandecita)\b/.test(value)) return 16;
  if (/\b(mediana|mediano)\b/.test(value)) return 12;
  if (/\b(pequena|pequeno)\b/.test(value)) return 9;
  if (/\bfamiliar\b/.test(value)) return 24;
  return undefined;
}

function hasProductIntent(text: string): boolean {
  return /\b(regalame|dame|quiero|deseo|una|uno|vaso|fresas?|producto|pedido|ordenar|pedir)\b/i.test(normalize(text));
}

function extractDelivery(text: string): Partial<DeliverySlots> {
  const value = normalize(text);
  const result: Partial<DeliverySlots> = {};
  if (/\bcentro\b/.test(value)) result.neighborhood = 'Centro';
  const address = text.match(/(?:direccion|calle|carrera|cra\.?|cll\.?)\s+[^,.;]+/i);
  if (address) result.address = address[0].trim();
  const name = text.match(/(?:a nombre de|mi nombre es)\s+([a-záéíóúñ ]{3,40})/i);
  if (name) result.customerName = name[1].trim();
  return result;
}

function paymentFromText(text: string): PaymentMethod | undefined {
  const value = normalize(text);
  if (/daviplata/.test(value)) return 'DAVIPLATA';
  if (/\bnequi\b/.test(value)) return 'NEQUI';
  if (/efectivo|contra entrega/.test(value)) return 'EFECTIVO';
  return undefined;
}

export class OrderFsm {
  private current: OrderSession;
  private lastEvent!: OrderEvent;

  public constructor(current: OrderSession = initialSession()) {
    this.current = current;
    OrderSession.parse(current);
  }

  public get session(): OrderSession {
    return cloneSession(this.current);
  }

  public transition(rawEvent: unknown): TransitionResult {
    const event = OrderEvent.parse(rawEvent);
    this.lastEvent = event;
    const session = cloneSession(this.current);
    // Payment names can also match the FAQ vocabulary; in PAYMENT the slot
    // transition must take precedence over interruption handling.
    const faq = event.type === 'MESSAGE' && session.state !== 'PAYMENT' ? faqReply(event.text) : null;

    if (faq) {
      if (session.state !== 'IDLE' && session.state !== 'HANDOFF') session.interruptionStack.push(session.state);
      const hook = session.lastPrompt ? ` ${session.lastPrompt}` : ' ¿Continuamos con tu pedido?';
      session.lastPrompt = hook.trim();
      return this.accept(session, `${faq}${hook}`);
    }

    if (event.type === 'HANDOFF') {
      session.state = 'HANDOFF';
      return this.accept(session, 'Entiendo. Transferiré tu chat con un asesor de Antojitos para ayudarte personalmente.');
    }

    if (event.type === 'MESSAGE' && /hablar con (una )?persona|asesor|humano|problema con mi pedido/i.test(normalize(event.text))) {
      session.state = 'HANDOFF';
      return this.accept(session, 'Entiendo. Transferiré tu chat con un asesor de Antojitos para ayudarte personalmente.');
    }

    if (event.type === 'MESSAGE') {
      const size = detectedSize(event.text);
      if (size && (hasProductIntent(event.text) || session.state === 'EXPLORING_MENU' || session.state === 'CONFIGURING_PRODUCT')) {
        const changing = /cambi(a|amela|arlo|arlo por)|mejor/.test(normalize(event.text));
        const item: CartItem = {
          productId: `fresas_crema_${size}oz`,
          productName: 'Fresas con crema',
          sizeOz: size,
          unitPrice: SIZE_PRICES[size],
          quantity: 1,
          toppings: [],
          sauces: []
        };
        if (changing && session.cart.length > 0) session.cart[session.cart.length - 1] = item;
        else session.cart.push(item);
        session.state = 'CONFIGURING_PRODUCT';
        session.unknownAttempts = 0;
        session.lastPrompt = productPrompt(item);
        return this.accept(session, productPrompt(item));
      }

      const delivery = extractDelivery(event.text);
      if (Object.keys(delivery).length > 0 && session.state === 'COLLECTING_DELIVERY') {
        Object.assign(session.delivery, delivery);
        return this.accept(session, this.deliveryPrompt(session));
      }

      const payment = paymentFromText(event.text);
      if (payment && session.state === 'PAYMENT') {
        session.payment = { method: payment, status: payment === 'EFECTIVO' ? 'READY_FOR_CONFIRMATION' : 'PENDING_VERIFICATION' };
        session.state = 'CONFIRMATION';
        return this.accept(session, `Recibido: ${payment}. Te muestro el resumen para confirmar tu pedido.`);
      }

      if (session.state === 'IDLE' && /hola|buenas|menu|carta|quiero pedir|hacer pedido/i.test(normalize(event.text))) {
        session.state = 'EXPLORING_MENU';
        session.unknownAttempts = 0;
        session.lastPrompt = '¿Qué tamaño deseas: 9 oz, 12 oz, 16 oz o 24 oz?';
        return this.accept(session, '¡Hola! 🍓 Tenemos fresas con crema de 9, 12, 16 y 24 oz. ¿Cuál deseas?');
      }

      if (session.state === 'CONFIGURING_PRODUCT' && session.cart.length > 0 && /entrega|domicilio|continuemos|listo|ya/.test(normalize(event.text))) {
        session.state = 'COLLECTING_DELIVERY';
        session.lastPrompt = this.deliveryPrompt(session);
        return this.accept(session, session.lastPrompt);
      }

      if (session.state === 'COLLECTING_DELIVERY' && missingDelivery(session.delivery).length === 0) {
        session.state = 'PAYMENT';
        session.lastPrompt = '¿Pagarás con Nequi, Daviplata o efectivo contra entrega?';
        return this.accept(session, session.lastPrompt);
      }

      if (session.state === 'CONFIRMATION' && /confirm|si|sí|correcto|dale|enviar/.test(normalize(event.text))) {
        session.lastPrompt = 'Pedido listo para enviar al panel.';
        return this.accept(session, session.lastPrompt);
      }

      session.unknownAttempts += 1;
      if (session.unknownAttempts >= 2) {
        session.state = 'HANDOFF';
        return this.accept(session, 'No logré interpretar tu pedido después de dos intentos. Transferiré tu chat con un asesor.');
      }
      return this.accept(session, 'Quiero ayudarte. Puedes decir, por ejemplo: “regálame una de 12” o “una grande”.');
    }

    if (event.type === 'ADD_PRODUCT') {
      if (!['EXPLORING_MENU', 'CONFIGURING_PRODUCT'].includes(session.state)) return this.reject(session, 'Primero indícame que deseas hacer un pedido.');
      const item: CartItem = { productId: `fresas_crema_${event.sizeOz}oz`, productName: 'Fresas con crema', sizeOz: event.sizeOz, unitPrice: SIZE_PRICES[event.sizeOz] ?? 0, quantity: event.quantity, toppings: event.toppings, sauces: event.sauces };
      if (!item.unitPrice) return this.reject(session, 'Ese tamaño no está disponible. Elige 9, 12, 16 o 24 oz.');
      session.cart.push(item);
      session.state = 'CONFIGURING_PRODUCT';
      return this.accept(session, productPrompt(item));
    }

    if (event.type === 'SET_DELIVERY') {
      if (session.state !== 'COLLECTING_DELIVERY') return this.reject(session, 'La entrega aún no está habilitada en este punto del pedido.');
      Object.assign(session.delivery, event.data);
      if (missingDelivery(session.delivery).length === 0) session.state = 'PAYMENT';
      return this.accept(session, session.state === 'PAYMENT' ? '¿Pagarás con Nequi, Daviplata o efectivo contra entrega?' : this.deliveryPrompt(session));
    }

    if (event.type === 'SET_PAYMENT') {
      if (session.state !== 'PAYMENT') return this.reject(session, 'Primero debemos completar los datos de entrega.');
      session.payment = { method: event.method, reference: event.reference, status: event.method === 'EFECTIVO' ? 'READY_FOR_CONFIRMATION' : 'PENDING_VERIFICATION' };
      session.state = 'CONFIRMATION';
      return this.accept(session, 'Pago registrado. Revisa el resumen y confirma para dejar listo el pedido.');
    }

    if (event.type === 'CONFIRM') {
      if (session.state !== 'CONFIRMATION' || !session.payment || session.cart.length === 0) return this.reject(session, 'El pedido no está completo para confirmar.');
      return this.accept(session, 'Pedido confirmado y listo para enviar al panel.');
    }

    return this.reject(session, 'Transición no permitida.');
  }

  private deliveryPrompt(session: OrderSession): string {
    const missing = missingDelivery(session.delivery);
    return missing.length > 0 ? `Para el domicilio necesito ${missing.join(', ')}.` : 'Datos de entrega completos. ¿Pagarás con Nequi, Daviplata o efectivo contra entrega?';
  }

  private accept(session: OrderSession, reply: string): TransitionResult {
    session.lastPrompt = session.lastPrompt || reply;
    OrderSession.parse(session);
    this.current = session;
    return { session: cloneSession(session), accepted: true, reply, event: this.lastEvent };
  }

  private reject(session: OrderSession, reply: string): TransitionResult {
    OrderSession.parse(session);
    return { session: cloneSession(session), accepted: false, reply, event: this.lastEvent };
  }
}

export function createOrderFsm(session?: OrderSession): OrderFsm {
  return new OrderFsm(session);
}
