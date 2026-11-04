import { GetCatalogUseCase } from '../../application/use-cases/GetCatalogUseCase.js';
import { ValidateNequiReceiptUseCase } from '../../application/use-cases/ValidateNequiReceiptUseCase.js';
import { NotifyKitchenUseCase } from '../../application/use-cases/NotifyKitchenUseCase.js';
import { DeliveryPricingService } from '../../application/services/DeliveryPricingService.js';
import { CatalogProduct, CatalogProductOptionSize } from '../config/catalogLoader.js';
import type { IOrderRepository } from '../../domain/repositories/IOrderRepository.js';
import { BUSINESS_MUNICIPALITY, isSupportedMunicipality, normalizeBusinessText } from '../../application/config/businessFacts.js';

export class ToolExecutor {
  constructor(
    private readonly getCatalogUseCase: GetCatalogUseCase,
    private readonly validateReceiptUseCase: ValidateNequiReceiptUseCase,
    private readonly notifyKitchenUseCase: NotifyKitchenUseCase
    , private readonly deliveryPricingService: DeliveryPricingService = new DeliveryPricingService(),
    private readonly orderRepository?: IOrderRepository
  ) {}

  public async executeTool(name: string, args: any, requestId?: string): Promise<any> {
    switch (name) {
      case 'calcular_domicilio':
        if (args.municipio && !isSupportedMunicipality(String(args.municipio))) {
          return { error: `Antojitos solo atiende en ${BUSINESS_MUNICIPALITY}.` };
        }
        return this.deliveryPricingService.calculate({
          neighborhood: String(args.barrio),
          raining: Boolean(args.llueve),
          hour: args.hora === undefined ? undefined : Number(args.hora)
        });
      case 'obtener_catalogo': {
        return this.getCatalogUseCase.execute();
      }
      case 'calcular_total_pedido': {
        this.validateOrderAgainstCatalog(args.detalles_json);
        return this.calculateOrderTotal(args.detalles_json);
      }
      case 'validar_comprobante_nequi': {
        const expectedAmount = await this.resolveReceiptAmount(args);
        return await this.validateReceiptUseCase.execute({
          imageUrl: args.image_url,
          expectedAmount,
          orderId: args.order_id
        });
      }
      case 'notificar_cocina': {
        this.validateOrderAgainstCatalog(args.detalles_json);
        return await this.notifyKitchenUseCase.execute({
          resumen_pedido_formatted: args.resumen_pedido_formatted,
          detalles_json: args.detalles_json,
          idempotencyKey: requestId
        });
      }
      default:
        throw new Error(`Herramienta no reconocida: ${name}`);
    }
  }

  private normalize(value: unknown): string {
    return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  }

  /**
   * The model may propose a tool call, but it cannot override the catalog.
   * Rejecting mismatched IDs/names/prices prevents a hallucinated product from
   * reaching the kitchen or being saved as a real order.
   */
  private validateOrderAgainstCatalog(details: any): void {
    if (!details || !Array.isArray(details.items) || details.items.length === 0) {
      throw new Error('El pedido debe incluir al menos un producto del catálogo.');
    }
    const catalog = this.getCatalogUseCase.execute();
    for (const item of details.items) {
      const product = catalog.productos.find(candidate => candidate.id === item?.id_producto) as CatalogProduct | undefined;
      if (!product) throw new Error(`Producto no válido: ${String(item?.id_producto || '')}`);

      const productName = this.normalize(item.nombre);
      const catalogName = this.normalize(product.nombre);
      if (!productName || !(productName === catalogName || productName.includes(catalogName) || catalogName.includes(productName))) {
        throw new Error(`El nombre del producto no coincide con el catálogo para ${product.id}.`);
      }
      if (Number(item.precio_base) !== Number(product.precio_base)) {
        throw new Error(`El precio base de ${product.nombre} no coincide con el catálogo.`);
      }
      if (!Number.isInteger(Number(item.cantidad)) || Number(item.cantidad) < 1) {
        throw new Error(`Cantidad inválida para ${product.nombre}.`);
      }

      const options = product.opciones || {};
      if (product.id === 'fresas_crema_std' && !item.tamano) {
        throw new Error(`Falta el tamaño para ${product.nombre}.`);
      }
      if (item.tamano) {
        const requestedSize = this.normalize(item.tamano.nombre);
        const size = (options.tamaño || []).find((candidate: CatalogProductOptionSize) => {
          const canonical = this.normalize(candidate.nombre);
          return canonical === requestedSize ||
            (requestedSize === 'grande' && canonical === '16 onzas') ||
            (requestedSize === 'personal' && canonical === '9 onzas');
        });
        if (!size || Number(item.tamano.adicional) !== Number(size.adicional)) {
          throw new Error(`El tamaño o adicional no coincide con el catálogo para ${product.nombre}.`);
        }
      }
      if (product.id === 'fresas_crema_std' && !item.salsa) {
        throw new Error(`Falta la salsa para ${product.nombre}.`);
      }
      if (product.id === 'fresas_crema_std' && (!Array.isArray(item.toppings) || item.toppings.length !== 1)) {
        throw new Error(`${product.nombre} requiere exactamente un topping incluido.`);
      }
      if (item.salsa && Array.isArray(options.salsa) && !options.salsa.some(value => this.normalize(value) === this.normalize(item.salsa))) {
        throw new Error(`La salsa no está disponible para ${product.nombre}.`);
      }
      if (Array.isArray(item.toppings) && options.toppings) {
        if (item.toppings.length > options.toppings.max_seleccion) {
          throw new Error(`Se excedió el máximo de toppings para ${product.nombre}.`);
        }
        for (const topping of item.toppings) {
          if (!options.toppings.lista.some(value => this.normalize(value) === this.normalize(topping))) {
            throw new Error(`El topping no está disponible para ${product.nombre}: ${String(topping)}.`);
          }
        }
      }
      if (Array.isArray(item.adiciones_extra) && options.toppings_adicionales) {
        for (const addition of item.adiciones_extra) {
          const allowed = options.toppings_adicionales.find((value: { nombre: string; adicional: number }) => this.normalize(value.nombre) === this.normalize(addition?.nombre));
          if (!allowed || Number(addition.adicional) !== Number(allowed.adicional)) {
            throw new Error(`La adición no coincide con el catálogo para ${product.nombre}.`);
          }
        }
      }
    }

    const customer = details.cliente;
    if (!customer || !String(customer.nombre || '').trim()) throw new Error('El pedido requiere el nombre del cliente.');
    if (!['DOMICILIO', 'RECOGER_EN_LOCAL'].includes(customer.tipo_entrega)) throw new Error('Tipo de entrega inválido.');
    if (customer.municipio && !isSupportedMunicipality(String(customer.municipio))) {
      throw new Error(`Antojitos solo atiende en ${BUSINESS_MUNICIPALITY}.`);
    }
    const neighborhoodOrMunicipality = normalizeBusinessText(String(customer.barrio_municipio || ''));
    const unsupportedMunicipalities = ['valledupar', 'aguachica', 'bosconia', 'codazzi', 'la paz', 'manaure', 'becerril', 'curumani', 'chiriguana'];
    if (!customer.municipio && unsupportedMunicipalities.some(municipality => neighborhoodOrMunicipality === municipality)) {
      throw new Error(`Antojitos solo atiende en ${BUSINESS_MUNICIPALITY}.`);
    }
    if (customer.tipo_entrega === 'DOMICILIO' && (!String(customer.direccion || '').trim() || !String(customer.barrio_municipio || '').trim())) {
      throw new Error('El domicilio requiere dirección y barrio/municipio.');
    }
    if (!['EFECTIVO', 'NEQUI'].includes(details.metodo_pago)) throw new Error('Método de pago inválido.');
  }

  private calculateOrderTotal(details: any): { subtotal: number; delivery_fee: number; total: number; currency: 'COP' } {
    const catalog = this.getCatalogUseCase.execute();
    const subtotal = details.items.reduce((orderTotal: number, item: any) => {
      const product = catalog.productos.find(candidate => candidate.id === item.id_producto) as CatalogProduct;
      const sizeAdditional = item.tamano
        ? Number((product.opciones?.tamaño || []).find(option => this.normalize(option.nombre) === this.normalize(item.tamano.nombre))?.adicional || 0)
        : 0;
      const additions = (item.adiciones_extra || []).reduce((total: number, addition: any) => total + Number(addition.adicional || 0), 0);
      const extraCheese = Number(item.extra_queso?.adicional || 0);
      const unitPrice = Number(product.precio_base) + sizeAdditional + additions + extraCheese;
      return orderTotal + unitPrice * Number(item.cantidad);
    }, 0);
    const deliveryFee = details.cliente.tipo_entrega === 'DOMICILIO'
      ? this.deliveryPricingService.calculate({ neighborhood: String(details.cliente.barrio_municipio) }).amount
      : 0;
    return { subtotal, delivery_fee: deliveryFee, total: subtotal + deliveryFee, currency: 'COP' };
  }

  private async resolveReceiptAmount(args: any): Promise<number> {
    if (!this.orderRepository) {
      const legacyAmount = Number(args.monto_esperado);
      if (Number.isFinite(legacyAmount) && legacyAmount > 0) return legacyAmount;
      throw new Error('No se pudo identificar la orden para validar el comprobante.');
    }

    const order = args.order_id
      ? await this.orderRepository.findById(String(args.order_id))
      : args.telefono
        ? await this.orderRepository.findLatestByPhoneNumber(String(args.telefono))
        : null;
    if (!order) throw new Error('No se encontró la orden persistida para validar el comprobante.');
    if (order.paymentMethod !== 'NEQUI') throw new Error('La orden no está configurada para pago con Nequi.');
    if (order.status.value === 'CANCELLED') throw new Error('La orden está cancelada.');
    return order.getTotal().amount;
  }
}
