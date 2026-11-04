export interface IOrderPaymentPort {
  markPaymentVerified(orderId: string, reference: string): Promise<boolean>;
}
