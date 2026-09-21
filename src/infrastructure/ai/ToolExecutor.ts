import { GetCatalogUseCase } from '../../application/use-cases/GetCatalogUseCase.js';
import { ValidateNequiReceiptUseCase } from '../../application/use-cases/ValidateNequiReceiptUseCase.js';
import { NotifyKitchenUseCase } from '../../application/use-cases/NotifyKitchenUseCase.js';

export class ToolExecutor {
  constructor(
    private readonly getCatalogUseCase: GetCatalogUseCase,
    private readonly validateReceiptUseCase: ValidateNequiReceiptUseCase,
    private readonly notifyKitchenUseCase: NotifyKitchenUseCase
  ) {}

  public async executeTool(name: string, args: any): Promise<any> {
    switch (name) {
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
        return await this.notifyKitchenUseCase.execute({
          resumen_pedido_formatted: args.resumen_pedido_formatted,
          detalles_json: args.detalles_json
        });
      }
      default:
        throw new Error(`Herramienta no reconocida: ${name}`);
    }
  }
}
