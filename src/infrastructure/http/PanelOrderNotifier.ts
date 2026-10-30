import { Order } from '../../domain/entities/Order.js';
import {
  IPanelOrderNotifier,
  PanelOrderNotifierError,
  PanelOrderPayload,
  PanelOrderPublishResult
} from '../../application/ports/IPanelOrderNotifier.js';

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface PanelOrderNotifierOptions {
  baseUrl: string;
  timeoutMs?: number;
  maxAttempts?: number;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
  deliveryFee?: number | ((order: Order) => number);
  municipality?: string;
  department?: string;
  authorizationToken?: string;
  fetch?: FetchLike;
  sleep?: (delayMs: number) => Promise<void>;
  random?: () => number;
}

export class PanelOrderNotifier implements IPanelOrderNotifier {
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly retryBaseDelayMs: number;
  private readonly retryMaxDelayMs: number;
  private readonly deliveryFee: number | ((order: Order) => number);
  private readonly municipality: string;
  private readonly department: string;
  private readonly authorizationToken?: string;
  private readonly fetcher: FetchLike;
  private readonly sleep: (delayMs: number) => Promise<void>;
  private readonly random: () => number;

  constructor(options: PanelOrderNotifierOptions) {
    if (!options.baseUrl.trim()) {
      throw new Error('La URL base del panel es obligatoria');
    }
    if ((options.timeoutMs ?? 5_000) <= 0) {
      throw new Error('timeoutMs debe ser mayor que 0');
    }
    if ((options.maxAttempts ?? 3) < 1) {
      throw new Error('maxAttempts debe ser mayor que 0');
    }

    this.endpoint = `${options.baseUrl.replace(/\/$/, '')}/api/v1/orders`;
    this.timeoutMs = options.timeoutMs ?? 5_000;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 250;
    this.retryMaxDelayMs = options.retryMaxDelayMs ?? 5_000;
    this.deliveryFee = options.deliveryFee ?? 0;
    this.municipality = options.municipality ?? 'Pueblo Bello';
    this.department = options.department ?? 'Cesar';
    this.authorizationToken = options.authorizationToken;
    this.fetcher = options.fetch ?? ((input, init) => fetch(input, init));
    this.sleep = options.sleep ?? ((delayMs) => new Promise(resolve => setTimeout(resolve, delayMs)));
    this.random = options.random ?? Math.random;
  }

  public async publish(order: Order): Promise<PanelOrderPublishResult> {
    const payload = this.toPayload(order);
    let lastError: PanelOrderNotifierError | undefined;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const response = await this.send(payload);
        const responseBody = await this.readResponseBody(response);

        if (response.ok) {
          return {
            orderId: order.id,
            attempts: attempt,
            status: response.status,
            responseBody
          };
        }

        const kind = response.status >= 500 ? 'server' : 'client';
        lastError = new PanelOrderNotifierError(
          `El panel rechazó el pedido con HTTP ${response.status}`,
          kind,
          order.id,
          attempt,
          response.status,
          responseBody
        );

        if (kind === 'client' || attempt === this.maxAttempts) {
          throw lastError;
        }
      } catch (error) {
        if (error instanceof PanelOrderNotifierError && error.kind === 'client') {
          throw error;
        }

        if (error instanceof PanelOrderNotifierError) {
          lastError = error;
        } else {
          const kind = this.isAbortError(error) ? 'timeout' : 'network';
          lastError = new PanelOrderNotifierError(
            kind === 'timeout' ? 'Se agotó el tiempo de espera del panel' : 'No se pudo conectar con el panel',
            kind,
            order.id,
            attempt,
            undefined,
            undefined,
            error instanceof Error ? error : undefined
          );
        }

        if (attempt === this.maxAttempts) {
          throw lastError;
        }
      }

      await this.sleep(this.retryDelay(attempt));
    }

    throw lastError ?? new PanelOrderNotifierError('No se pudo publicar el pedido', 'network', order.id, this.maxAttempts);
  }

  private toPayload(order: Order): PanelOrderPayload {
    const subtotal = order.getTotal().amount;
    const deliveryFee = typeof this.deliveryFee === 'function' ? this.deliveryFee(order) : this.deliveryFee;
    if (!Number.isFinite(deliveryFee) || deliveryFee < 0) {
      throw new Error('deliveryFee debe ser un número finito no negativo');
    }

    return {
      order_id: order.id,
      created_at: order.createdAt.toISOString(),
      customer: {
        phone: order.customer.phoneNumber.startsWith('+') ? order.customer.phoneNumber : `+${order.customer.phoneNumber}`,
        name: order.customer.name
      },
      delivery: {
        type: order.customer.deliveryType,
        address: order.customer.address ?? order.customer.getFullAddress(),
        neighborhood: order.customer.neighborhoodOrMunicipality ?? '',
        municipality: this.municipality,
        department: this.department,
        notes: order.customer.addressDetails ?? ''
      },
      items: order.items.map(item => ({
        product_name: item.productName,
        quantity: item.quantity,
        unit_price: item.getUnitPrice().amount,
        toppings: [...item.toppings],
        sauces: item.sauce ? [item.sauce] : [],
        subtotal: item.getSubtotal().amount
      })),
      financials: {
        subtotal,
        delivery_fee: deliveryFee,
        total: subtotal + deliveryFee,
        payment_method: order.paymentMethod,
        payment_status: order.nequiVerified ? 'VERIFICADO' : 'PENDIENTE_VERIFICACION'
      },
      source: 'WHATSAPP_BOT',
      status: 'NUEVO_PEDIDO'
    };
  }

  private async send(payload: PanelOrderPayload): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Idempotency-Key': payload.order_id,
        'X-Order-Id': payload.order_id
      };
      if (this.authorizationToken) {
        headers.Authorization = `Bearer ${this.authorizationToken}`;
      }

      return await this.fetcher(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async readResponseBody(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) return undefined;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }

  private retryDelay(attempt: number): number {
    const exponential = Math.min(this.retryMaxDelayMs, this.retryBaseDelayMs * (2 ** (attempt - 1)));
    return Math.round(exponential * this.random());
  }

  private isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError';
  }
}
