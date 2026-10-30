import { GetCatalogUseCase } from '../../application/use-cases/GetCatalogUseCase.js';
import { ValidateNequiReceiptUseCase } from '../../application/use-cases/ValidateNequiReceiptUseCase.js';
import { NotifyKitchenUseCase } from '../../application/use-cases/NotifyKitchenUseCase.js';
import { DeliveryPricingService } from '../../application/services/DeliveryPricingService.js';
import { CatalogProduct, CatalogProductOptionSize } from '../config/catalogLoader.js';

export class ToolExecutor {
  constructor(
    private readonly getCatalogUseCase: GetCatalogUseCase,
    private readonly validateReceiptUseCase: ValidateNequiReceiptUseCase,
    private readonly notifyKitchenUseCase: NotifyKitchenUseCase
    , private readonly deliveryPricingService: DeliveryPricingService = new DeliveryPricingService()
  ) {}

  public async executeTool(name: string, args: any): Promise<any> {
    switch (name) {
      case 'calcular_domicilio':
        return this.deliveryPricingService.calculate({
          neighborhood: String(args.barrio),
          raining: Boolean(args.llueve),
          hour: args.hora === undefined ? undefined : Number(args.hora)
        });
      case 'obtener_catalogo': {
        return this.getCatalogUseCase.execute();
      }
      case 'validar_comprobante_nequi': {
        return await this.validateReceiptUseCase.execute({
          imageUrl: args.image_url,
          expectedAmount: args.monto_esperado
        });
      }
      case 'notificar_cocina': {
        this.validateOrderAgainstCatalog(args.detalles_json);
        return await this.notifyKitchenUseCase.execute({
          resumen_pedido_formatted: args.resumen_pedido_formatted,
          detalles_json: args.detalles_json
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
    }
  }
}
