import { NequiReceipt } from '../entities/NequiReceipt.js';

export interface INequiReceiptRepository {
  /**
   * Verifica si una referencia Nequi (ej: M12345678) ya fue utilizada previamente en el sistema.
   * Regla de negocio crítica para evitar el reuso de comprobantes viejos.
   */
  existsReference(reference: string): Promise<boolean>;

  /**
   * Guarda un comprobante verificado en la base de datos.
   */
  save(receipt: NequiReceipt): Promise<void>;

  /**
   * Busca un comprobante por su número de referencia.
   */
  findByReference(reference: string): Promise<NequiReceipt | null>;
}
