export type OrderStatusType =
  | 'DRAFT'
  | 'PENDING_PAYMENT'
  | 'PAYMENT_VERIFIED'
  | 'SENT_TO_KITCHEN'
  | 'CANCELLED';

export class OrderStatus {
  constructor(public readonly value: OrderStatusType) {}

  public static draft(): OrderStatus {
    return new OrderStatus('DRAFT');
  }

  public static pendingPayment(): OrderStatus {
    return new OrderStatus('PENDING_PAYMENT');
  }

  public static paymentVerified(): OrderStatus {
    return new OrderStatus('PAYMENT_VERIFIED');
  }

  public static sentToKitchen(): OrderStatus {
    return new OrderStatus('SENT_TO_KITCHEN');
  }

  public isFinalized(): boolean {
    return this.value === 'SENT_TO_KITCHEN' || this.value === 'CANCELLED';
  }
}
