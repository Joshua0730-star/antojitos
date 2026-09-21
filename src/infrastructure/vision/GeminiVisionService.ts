import { GoogleGenerativeAI } from '@google/generative-ai';
import { IVisionService, NequiOcrExtraction, NequiOcrExtractionSchema } from '../../application/ports/IVisionService.js';

export class GeminiVisionService implements IVisionService {
  private genAI: GoogleGenerativeAI;
  private modelName: string;

  constructor(apiKey: string, modelName: string = 'gemini-2.0-flash') {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.modelName = modelName;
  }

  public async extractNequiReceiptData(imageSource: string): Promise<NequiOcrExtraction> {
    const model = this.genAI.getGenerativeModel({
      model: this.modelName,
      generationConfig: {
        responseMimeType: 'application/json'
      }
    });

    const prompt = `Analiza esta imagen y verifica si es un comprobante de transferencia o pago de Nequi (Colombia).
Extrae un JSON con exactamente este formato:
{
  "es_comprobante_nequi": boolean,
  "monto": number,
  "numero_m39_referencia": string,
  "fecha_hora": "YYYY-MM-DD HH:mm:ss",
  "estado_legible": boolean,
  "sospecha_fraude": boolean
}`;

    let base64Data = imageSource;
    let mimeType = 'image/jpeg';

    if (imageSource.startsWith('data:')) {
      const parts = imageSource.split(',');
      const match = parts[0].match(/:(.*?);/);
      if (match) mimeType = match[1];
      base64Data = parts[1];
    }

    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType
      }
    };

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text();
    const parsed = JSON.parse(text);
    return NequiOcrExtractionSchema.parse(parsed);
  }
}
