import { Customer } from './Customer.js';
import { OrderItem } from './OrderItem.js';
import { Money } from '../value-objects/Money.js';
import { OrderStatus } from '../value-objects/OrderStatus.js';

export type PaymentMethod = 'EFECTIVO' | 'NEQUI';

export interface OrderProps {
  id: string; // e.g. "ANT-8492"
  customer: Customer;
  items: OrderItem[];
  paymentMethod: PaymentMethod;
  cashBillAmount?: number;
  nequiReference?: string;
  nequiVerified?: boolean;
  status?: OrderStatus;
  createdAt?: Date;
}

export class Order {
  public readonly id: string;
  public readonly customer: Customer;
  public readonly items: OrderItem[];
  public readonly paymentMethod: PaymentMethod;
  public readonly cashBillAmount?: number;
  public nequiReference?: string;
  public nequiVerified: boolean;
  public status: OrderStatus;
  public readonly createdAt: Date;

  constructor(props: OrderProps) {
    if (!props.items || props.items.length === 0) {
      throw new Error('El pedido debe contener al menos un producto');
    }
    this.id = props.id;
    this.customer = props.customer;
    this.items = props.items;
    this.paymentMethod = props.paymentMethod;
    this.cashBillAmount = props.cashBillAmount;
    this.nequiReference = props.nequiReference;
    this.nequiVerified = props.nequiVerified || false;
    this.status = props.status || OrderStatus.draft();
    this.createdAt = props.createdAt || new Date();
  }

  public getTotal(): Money {
    return this.items.reduce((total, item) => total.add(item.getSubtotal()), Money.zero());
  }

  public calculateChange(): Money | null {
    if (this.paymentMethod !== 'EFECTIVO' || !this.cashBillAmount) {
      return null;
    }
    const total = this.getTotal().amount;
    if (this.cashBillAmount < total) {
      return Money.zero();
    }
    return Money.cop(this.cashBillAmount - total);
  }

  public markAsPaymentVerified(nequiRef?: string): void {
    this.nequiVerified = true;
    if (nequiRef) {
      this.nequiReference = nequiRef;
    }
    this.status = OrderStatus.paymentVerified();
  }

  public markAsSentToKitchen(): void {
    this.status = OrderStatus.sentToKitchen();
  }

  public formatForKitchen(): string {
    const total = this.getTotal().amount;
    const formattedTotal = `$${total.toLocaleString('es-CO')} COP`;

    const deliveryLabel = this.customer.deliveryType === 'DOMICILIO' ? 'Domicilio' : 'Recoger en local';
    const addressLabel = this.customer.getFullAddress();

    // Formato de hora: ej. 03:06 PM
    const timeFormatted = this.createdAt.toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    const itemsFormatted = this.items.map(item => item.formatForKitchen()).join('\n');

    let paymentMethodLine = '';
    let refLine = '';

    if (this.paymentMethod === 'NEQUI') {
      paymentMethodLine = this.nequiVerified
        ? '💳 *Método de Pago:* Nequi (VERIFICADO ✅)'
        : '💳 *Método de Pago:* Nequi (PENDIENTE DE VERIFICACIÓN)';
      refLine = `\n🔍 *Ref. Nequi:* ${this.nequiReference || 'N/A'}`;
    } else {
      const change = this.calculateChange();
      const changeText = change && change.amount > 0
        ? ` (Paga con $${this.cashBillAmount?.toLocaleString('es-CO')} - Cambio: ${change.formatCOP()})`
        : '';
      paymentMethodLine = `💳 *Método de Pago:* Efectivo contra entrega${changeText}`;
    }

    return `🚨 *¡NUEVO PEDIDO CONFIRMADO!* 🚨
------------------------------------
📌 *Orden ID:* #${this.id}
👤 *Cliente:* ${this.customer.name}
📞 *Teléfono:* ${this.customer.phoneNumber}
🛵 *Tipo:* ${deliveryLabel}
📍 *Dirección:* ${addressLabel}
------------------------------------
📝 *DETALLE DEL PEDIDO:*

${itemsFormatted}
------------------------------------
💰 *TOTAL A COBRAR:* ${formattedTotal}
${paymentMethodLine}${refLine}
------------------------------------
⏱ *Hora del Pedido:* ${timeFormatted}`;
  }
}
