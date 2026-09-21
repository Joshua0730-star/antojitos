export interface NequiReceiptProps {
  reference: string;
  amount: number;
  transactionDate: string;
  isNequiReceipt: boolean;
  isLegible: boolean;
  fraudSuspicion: boolean;
  imageUrl?: string;
  orderId?: string;
  id?: string;
  createdAt?: Date;
}

export class NequiReceipt {
  public readonly id?: string;
  public readonly reference: string;
  public readonly amount: number;
  public readonly transactionDate: string;
  public readonly isNequiReceipt: boolean;
  public readonly isLegible: boolean;
  public readonly fraudSuspicion: boolean;
  public readonly imageUrl?: string;
  public readonly orderId?: string;
  public readonly createdAt: Date;

  constructor(props: NequiReceiptProps) {
    this.id = props.id;
    this.reference = props.reference.trim().toUpperCase();
    this.amount = props.amount;
    this.transactionDate = props.transactionDate.trim();
    this.isNequiReceipt = props.isNequiReceipt;
    this.isLegible = props.isLegible;
    this.fraudSuspicion = props.fraudSuspicion;
    this.imageUrl = props.imageUrl;
    this.orderId = props.orderId;
    this.createdAt = props.createdAt || new Date();
  }

  public isValidForAmount(expectedAmount: number): { valid: boolean; reason?: string } {
    if (!this.isNequiReceipt) {
      return { valid: false, reason: 'La imagen enviada no corresponde a un comprobante Nequi válido.' };
    }

    if (!this.isLegible) {
      return { valid: false, reason: 'La imagen no es legible o está borrosa. Por favor envía una captura más clara.' };
    }

    if (this.fraudSuspicion) {
      return { valid: false, reason: 'Se detectaron inconsistencias en la imagen del comprobante.' };
    }

    if (this.amount < expectedAmount) {
      return {
        valid: false,
        reason: `El comprobante es por $${this.amount.toLocaleString('es-CO')} COP, pero el total del pedido es de $${expectedAmount.toLocaleString('es-CO')} COP.`
      };
    }

    // Validación básica de formato de referencia Nequi (generalmente empieza con M seguido de dígitos)
    if (!this.reference || this.reference.length < 5) {
      return { valid: false, reason: 'No se pudo identificar el número de referencia del comprobante.' };
    }

    return { valid: true };
  }
}
