import { Order } from '../../domain/entities/Order.js';

export interface PanelOrderItem {
  product_name: string;
  quantity: number;
  unit_price: number;
  toppings: string[];
  sauces: string[];
  subtotal: number;
}

export interface PanelOrderPayload {
  order_id: string;
  created_at: string;
  customer: {
    phone: string;
    name: string;
  };
  delivery: {
    type: 'DOMICILIO' | 'RECOGER_EN_LOCAL';
    address: string;
    neighborhood: string;
    municipality: string;
    department: string;
    notes: string;
  };
  items: PanelOrderItem[];
  financials: {
    subtotal: number;
    delivery_fee: number;
    total: number;
    payment_method: string;
    payment_status: 'VERIFICADO' | 'PENDIENTE_VERIFICACION';
  };
  source: 'WHATSAPP_BOT';
  status: 'NUEVO_PEDIDO';
}

export interface PanelOrderPublishResult {
  orderId: string;
  attempts: number;
  status: number;
  responseBody: unknown;
}

export type PanelNotifierErrorKind = 'client' | 'server' | 'network' | 'timeout';

export class PanelOrderNotifierError extends Error {
  public readonly name = 'PanelOrderNotifierError';

  constructor(
    message: string,
    public readonly kind: PanelNotifierErrorKind,
    public readonly orderId: string,
    public readonly attempts: number,
    public readonly status?: number,
    public readonly responseBody?: unknown,
    options?: ErrorOptions
  ) {
    super(message, options);
  }
}

export interface IPanelOrderNotifier {
  publish(order: Order): Promise<PanelOrderPublishResult>;
  publishPayload(payload: PanelOrderPayload): Promise<PanelOrderPublishResult>;
}
