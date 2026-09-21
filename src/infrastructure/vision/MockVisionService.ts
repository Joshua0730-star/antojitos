import { IVisionService, NequiOcrExtraction } from '../../application/ports/IVisionService.js';

export class MockVisionService implements IVisionService {
  private customExtraction: NequiOcrExtraction | null = null;

  public setExtractionResult(result: NequiOcrExtraction): void {
    this.customExtraction = result;
  }

  public async extractNequiReceiptData(imageSource: string): Promise<NequiOcrExtraction> {
    if (this.customExtraction) {
      return this.customExtraction;
    }

    // Si el texto incluye parámetros simulados en JSON o keywords
    if (imageSource.includes('invalido')) {
      return {
        es_comprobante_nequi: false,
        monto: 0,
        numero_m39_referencia: '',
        fecha_hora: new Date().toISOString().replace('T', ' ').slice(0, 19),
        estado_legible: false,
        sospecha_fraude: true
      };
    }

    if (imageSource.includes('repetido')) {
      return {
        es_comprobante_nequi: true,
        monto: 23000,
        numero_m39_referencia: 'M98765432', // Misma ref para probar duplicado
        fecha_hora: new Date().toISOString().replace('T', ' ').slice(0, 19),
        estado_legible: true,
        sospecha_fraude: false
      };
    }

    // Caso de éxito estándar para simulador
    const randomRef = 'M' + Math.floor(10000000 + Math.random() * 90000000);
    const today = new Date().toISOString().replace('T', ' ').slice(0, 19);

    // Si viene un monto numérico en el source (ej: "comprobante_23000")
    const match = imageSource.match(/_(\d+)/);
    const amount = match ? parseInt(match[1], 10) : 23000;

    return {
      es_comprobante_nequi: true,
      monto: amount,
      numero_m39_referencia: randomRef,
      fecha_hora: today,
      estado_legible: true,
      sospecha_fraude: false
    };
  }
}
