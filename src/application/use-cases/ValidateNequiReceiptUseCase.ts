import { IVisionService } from '../ports/IVisionService.js';
import { INequiReceiptRepository } from '../../domain/repositories/INequiReceiptRepository.js';
import { NequiReceipt } from '../../domain/entities/NequiReceipt.js';

export interface ValidateReceiptInput {
  imageUrl: string;
  expectedAmount: number;
  orderId?: string;
}

export interface ValidateReceiptOutput {
  exito: boolean;
  mensaje: string;
  referencia: string;
}

export class ValidateNequiReceiptUseCase {
  constructor(
    private readonly visionService: IVisionService,
    private readonly receiptRepository: INequiReceiptRepository
  ) {}

  public async execute(input: ValidateReceiptInput): Promise<ValidateReceiptOutput> {
    try {
      // 1. Extraer datos con el servicio de Visión
      const ocrData = await this.visionService.extractNequiReceiptData(input.imageUrl);

      // 2. Validar que sea comprobante Nequi y legible
      if (!ocrData.es_comprobante_nequi) {
        return {
          exito: false,
          mensaje: 'La imagen enviada no corresponde a un comprobante Nequi.',
          referencia: ''
        };
      }

      if (!ocrData.estado_legible) {
        return {
          exito: false,
          mensaje: 'La imagen está borrosa o no se pueden leer los datos con claridad.',
          referencia: ''
        };
      }

      if (ocrData.sospecha_fraude) {
        return {
          exito: false,
          mensaje: 'El comprobante presenta alteraciones visuales o sospecha de fraude.',
          referencia: ''
        };
      }

      const reference = ocrData.numero_m39_referencia.trim().toUpperCase();

      // 3. Validar unicidad de referencia (Anti-Fraude de reuso)
      const alreadyExists = await this.receiptRepository.existsReference(reference);
      if (alreadyExists) {
        return {
          exito: false,
          mensaje: `El número de referencia ${reference} ya fue utilizado en un pedido anterior. Por favor verifica tu comprobante.`,
          referencia: reference
        };
      }

      // 4. Validar monto
      if (ocrData.monto < input.expectedAmount) {
        return {
          exito: false,
          mensaje: `El comprobante muestra un pago de $${ocrData.monto.toLocaleString('es-CO')}, pero el total de la orden es $${input.expectedAmount.toLocaleString('es-CO')}.`,
          referencia: reference
        };
      }

      // 5. Validar fecha actual (mismo año-mes-día)
      const nowStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const receiptDate = ocrData.fecha_hora.slice(0, 10);
      if (receiptDate && receiptDate !== nowStr) {
        // En caso de que la fecha extraída no coincida con el día de hoy
        const [todayY, todayM, todayD] = nowStr.split('-');
        const [recY, recM, recD] = receiptDate.split('-');
        if (todayY !== recY || todayM !== recM || Math.abs(parseInt(todayD) - parseInt(recD)) > 0) {
          return {
            exito: false,
            mensaje: `El comprobante tiene fecha (${ocrData.fecha_hora}) que no corresponde al día de hoy.`,
            referencia: reference
          };
        }
      }

      // 6. Guardar en base de datos como comprobante consumido
      const receiptEntity = new NequiReceipt({
        reference,
        amount: ocrData.monto,
        transactionDate: ocrData.fecha_hora,
        isNequiReceipt: true,
        isLegible: true,
        fraudSuspicion: false,
        imageUrl: input.imageUrl,
        orderId: input.orderId
      });

      await this.receiptRepository.save(receiptEntity);

      return {
        exito: true,
        mensaje: `Comprobante Nequi verificado con éxito por $${ocrData.monto.toLocaleString('es-CO')} COP. Ref: ${reference}`,
        referencia: reference
      };
    } catch (error: any) {
      return {
        exito: false,
        mensaje: `Error al procesar el comprobante: ${error.message || 'Error desconocido'}`,
        referencia: ''
      };
    }
  }
}
