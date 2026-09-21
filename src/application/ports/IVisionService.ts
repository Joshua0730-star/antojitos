import { z } from 'zod';

export const NequiOcrExtractionSchema = z.object({
  es_comprobante_nequi: z.boolean(),
  monto: z.number(),
  numero_m39_referencia: z.string(),
  fecha_hora: z.string(),
  estado_legible: z.boolean(),
  sospecha_fraude: z.boolean()
});

export type NequiOcrExtraction = z.infer<typeof NequiOcrExtractionSchema>;

export interface IVisionService {
  /**
   * Extrae los campos estructurados del comprobante Nequi a partir de una URL o buffer en base64.
   */
  extractNequiReceiptData(imageSource: string): Promise<NequiOcrExtraction>;
}
