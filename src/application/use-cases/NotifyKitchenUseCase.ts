import { IWhatsAppService } from '../ports/IWhatsAppService.js';
import { IOrderRepository } from '../../domain/repositories/IOrderRepository.js';
import { Order } from '../../domain/entities/Order.js';
import { Customer } from '../../domain/entities/Customer.js';
import { OrderItem } from '../../domain/entities/OrderItem.js';
import { OrderStatus } from '../../domain/value-objects/OrderStatus.js';
import type { IOrderOutbox } from '../ports/IOrderOutbox.js';
import type { PanelOrderPayload } from '../ports/IPanelOrderNotifier.js';
import type { PanelOrderNotifier } from '../../infrastructure/http/PanelOrderNotifier.js';
import type { IOrderCreationPort } from '../ports/IOrderCreationPort.js';
import type { IConversationRepository } from '../../domain/repositories/IConversationRepository.js';
import { ENV } from '../../infrastructure/config/env.js';
import crypto from 'node:crypto';
import type { IOrderIdempotencyPort } from '../ports/IOrderIdempotencyPort.js';
import { DeliveryPricingService } from '../services/DeliveryPricingService.js';

export interface NotifyKitchenInput {
  resumen_pedido_formatted: string;
  idempotencyKey?: string;
  detalles_json: {
    cliente: {
      nombre: string;
      telefono: string;
      tipo_entrega: 'DOMICILIO' | 'RECOGER_EN_LOCAL';
      direccion?: string;
      barrio_municipio?: string;
      especificaciones?: string;
    };
    items: Array<{
      id_producto: string;
      nombre: string;
      categoria?: string;
      precio_base: number;
      cantidad: number;
      tamano?: { nombre: string; adicional: number };
      toppings?: string[];
      salsa?: string;
      adiciones_extra?: Array<{ nombre: string; adicional: number }>;
      sabor_helado?: string;
      extra_queso?: { nombre: string; adicional: number };
    }>;
    metodo_pago: 'EFECTIVO' | 'NEQUI';
    paga_con_billete?: number;
    referencia_nequi?: string;
    orden_id?: string;
  };
}

export interface NotifyKitchenOutput {
  enviado: boolean;
  orden_id: string;
  subtotal?: number;
  delivery_fee?: number;
  total?: number;
}

export class NotifyKitchenUseCase {
  constructor(
    private readonly whatsAppService: IWhatsAppService,
    private readonly orderRepository: IOrderRepository,
    private readonly orderOutbox?: IOrderOutbox<PanelOrderPayload>,
    private readonly panelOrderNotifier?: PanelOrderNotifier,
    private readonly orderCreationPort?: IOrderCreationPort,
    private readonly conversationRepository?: IConversationRepository,
    private readonly orderIdempotencyPort?: IOrderIdempotencyPort,
    private readonly deliveryPricingService: DeliveryPricingService = new DeliveryPricingService()
  ) {}

  public async execute(input: NotifyKitchenInput): Promise<NotifyKitchenOutput> {
    try {
      const { detalles_json, resumen_pedido_formatted } = input;

      const phone = String(detalles_json.cliente.telefono || '').replace(/\D/g, '');
      if (phone.length < 7) {
        // La identidad telefónica solo se solicita al cerrar el pedido, no al
        // iniciar la conversación. El modelo recibe este resultado y debe
        // pedir el número antes de volver a intentar confirmar.
        return { enviado: false, orden_id: 'PHONE_REQUIRED' };
      }

      // A pause can happen while an OpenAI request is still in flight. Check
      // the durable conversation state again immediately before creating the
      // order so a late tool call cannot bypass the operator takeover.
      if (this.conversationRepository) {
        const conversation = await this.conversationRepository.getState(phone);
        const pauseUntil = conversation.humanPauseUntil?.getTime();
        const cooldownActive = conversation.lastHumanInteraction &&
          conversation.lastHumanInteraction.getTime() + ENV.COEXISTENCE_COOLDOWN_MINUTES * 60_000 > Date.now();
        const pauseActive = conversation.botPausedIndefinitely ||
          (conversation.coexistenceStatus === 'HUMAN_TAKE-OVER' &&
            (pauseUntil !== undefined ? pauseUntil > Date.now() : Boolean(cooldownActive)));
        if (pauseActive) return { enviado: false, orden_id: 'PAUSED_BY_HUMAN' };
      }

      // El identificador debe tener suficiente entropía para no sobrescribir
      // otra orden por una colisión en PostgreSQL.
      const orderId =
        detalles_json.orden_id ||
        `ANT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

      // Construir la entidad Customer
      const customer = new Customer({
        name: detalles_json.cliente.nombre,
        phoneNumber: phone,
        deliveryType: detalles_json.cliente.tipo_entrega,
        address: detalles_json.cliente.direccion,
        neighborhoodOrMunicipality: detalles_json.cliente.barrio_municipio,
        addressDetails: detalles_json.cliente.especificaciones
      });

      const deliveryFee = customer.deliveryType === 'DOMICILIO'
        ? this.deliveryPricingService.calculate({ neighborhood: customer.neighborhoodOrMunicipality || '' }).amount
        : 0;

      // Construir los OrderItems
      const items = detalles_json.items.map(
        it =>
          new OrderItem({
            productId: it.id_producto,
            productName: it.nombre,
            category: it.categoria || 'Varios',
            basePrice: it.precio_base,
            quantity: it.cantidad || 1,
            size: it.tamano,
            toppings: it.toppings,
            sauce: it.salsa,
            extraAdditions: it.adiciones_extra?.map(a => ({
              name: a.nombre,
              additionalPrice: a.adicional
            })),
            iceCreamFlavor: it.sabor_helado,
            extraCheese: it.extra_queso
          })
      );

      // En este caso la herramienta se invoca únicamente después de aceptar
      // y validar el pedido. El estado intermedio se conserva para que la
      // consulta por teléfono nunca muestre una orden como preparada antes
      // de enviarla realmente a cocina.
      // Una referencia enviada por el modelo o por el cliente no prueba el
      // pago. La verificación ocurre en un flujo explícito de comprobante o
      // mediante una transición administrativa autorizada.
      const paymentVerified = false;
      let order = new Order({
        id: orderId,
        customer,
        items,
        paymentMethod: detalles_json.metodo_pago,
        cashBillAmount: detalles_json.paga_con_billete,
        nequiReference: detalles_json.referencia_nequi,
        // Confirmar el pedido y enviarlo a cocina no implica que el dinero ya
        // esté confirmado. El pago se valida posteriormente desde el panel.
        nequiVerified: paymentVerified,
        deliveryFee,
        status: paymentVerified ? OrderStatus.paymentVerified() : OrderStatus.pendingPayment()
      });

      // 1. Persistir orden y evento de panel atomically when production has
      // the PostgreSQL outbox enabled. The fallback is kept for local/dev
      // adapters that do not support a shared transaction.
      const panelPayload = this.orderOutbox && this.panelOrderNotifier
        ? this.panelOrderNotifier.toPanelPayload(order)
        : undefined;
      if (panelPayload && this.orderCreationPort) {
        await this.orderCreationPort.saveOrderAndEnqueue(order, panelPayload);
      } else if (input.idempotencyKey && this.orderIdempotencyPort) {
        const result = await this.orderIdempotencyPort.saveOrderIdempotently(order, input.idempotencyKey);
        order = result.order;
        if (!result.created && order.status.value === 'SENT_TO_KITCHEN') {
          return { enviado: true, orden_id: order.id, subtotal: order.getSubtotal().amount, delivery_fee: order.deliveryFee, total: order.getTotal().amount };
        }
      } else {
        await this.orderRepository.save(order);
        if (panelPayload && this.orderOutbox) {
          await this.orderOutbox.enqueue(order.id, panelPayload);
        }
      }

      // 2. Usar el formato oficial generado por el dominio si el texto del LLM difiere
      const finalFormattedMessage =
        resumen_pedido_formatted && resumen_pedido_formatted.includes('NUEVO PEDIDO CONFIRMADO')
          ? resumen_pedido_formatted
          : order.formatForKitchen();

      // 3. Despachar mensaje a cocina por WhatsApp
      const sent = await this.whatsAppService.sendKitchenAlert(finalFormattedMessage);

      if (sent) {
        order.markAsSentToKitchen();
        await this.orderRepository.save(order);
      }

      return {
        enviado: sent,
        orden_id: orderId,
        subtotal: order.getSubtotal().amount,
        delivery_fee: order.deliveryFee,
        total: order.getTotal().amount
      };
    } catch (error: any) {
      console.error('Error al notificar a cocina:', error);
      return {
        enviado: false,
        orden_id: input.detalles_json?.orden_id || 'ERROR'
      };
    }
  }
}
