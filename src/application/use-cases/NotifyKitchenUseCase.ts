import { IWhatsAppService } from '../ports/IWhatsAppService.js';
import { IOrderRepository } from '../../domain/repositories/IOrderRepository.js';
import { Order } from '../../domain/entities/Order.js';
import { Customer } from '../../domain/entities/Customer.js';
import { OrderItem } from '../../domain/entities/OrderItem.js';
import { OrderStatus } from '../../domain/value-objects/OrderStatus.js';

export interface NotifyKitchenInput {
  resumen_pedido_formatted: string;
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
}

export class NotifyKitchenUseCase {
  constructor(
    private readonly whatsAppService: IWhatsAppService,
    private readonly orderRepository: IOrderRepository
  ) {}

  public async execute(input: NotifyKitchenInput): Promise<NotifyKitchenOutput> {
    try {
      const { detalles_json, resumen_pedido_formatted } = input;

      // Generar ID de orden aleatorio si no viene provisto (formato ANT-XXXX)
      const orderId =
        detalles_json.orden_id ||
        `ANT-${Math.floor(1000 + Math.random() * 9000)}`;

      // Construir la entidad Customer
      const customer = new Customer({
        name: detalles_json.cliente.nombre,
        phoneNumber: detalles_json.cliente.telefono,
        deliveryType: detalles_json.cliente.tipo_entrega,
        address: detalles_json.cliente.direccion,
        neighborhoodOrMunicipality: detalles_json.cliente.barrio_municipio,
        addressDetails: detalles_json.cliente.especificaciones
      });

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

      // Crear la entidad Order
      const order = new Order({
        id: orderId,
        customer,
        items,
        paymentMethod: detalles_json.metodo_pago,
        cashBillAmount: detalles_json.paga_con_billete,
        nequiReference: detalles_json.referencia_nequi,
        nequiVerified: detalles_json.metodo_pago === 'NEQUI',
        status: OrderStatus.sentToKitchen()
      });

      // 1. Guardar orden en base de datos
      await this.orderRepository.save(order);

      // 2. Usar el formato oficial generado por el dominio si el texto del LLM difiere
      const finalFormattedMessage =
        resumen_pedido_formatted && resumen_pedido_formatted.includes('NUEVO PEDIDO CONFIRMADO')
          ? resumen_pedido_formatted
          : order.formatForKitchen();

      // 3. Despachar mensaje a cocina por WhatsApp
      const sent = await this.whatsAppService.sendKitchenAlert(finalFormattedMessage);

      return {
        enviado: sent,
        orden_id: orderId
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
