import OpenAI from 'openai';
import { IVisionService, NequiOcrExtraction, NequiOcrExtractionSchema } from '../../application/ports/IVisionService.js';

export class OpenAIVisionService implements IVisionService {
  private openai: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = 'gpt-4o') {
    this.openai = new OpenAI({ apiKey });
    this.model = model;
  }

  public async extractNequiReceiptData(imageSource: string): Promise<NequiOcrExtraction> {
    const prompt = `Analiza detalladamente esta imagen para verificar si es un comprobante de transferencia o pago legítimo de la aplicación Nequi (Colombia).
Extrae estrictamente un objeto JSON con los siguientes campos:
{
  "es_comprobante_nequi": true/false,
  "monto": 0 (número entero en pesos sin puntos ni comas ni signos de moneda),
  "numero_m39_referencia": "M12345678" (el código alfanumérico de referencia del movimiento, comúnmente empieza con M),
  "fecha_hora": "YYYY-MM-DD HH:mm:ss" (fecha y hora visible en el comprobante),
  "estado_legible": true/false (true si los textos y números son nítidos),
  "sospecha_fraude": true/false (true si se observan tipografías editadas, cortes extraños, montajes o alteraciones)
}
Responde ÚNICAMENTE con el objeto JSON válido.`;

    const imageUrlContent = imageSource.startsWith('data:') || imageSource.startsWith('http')
      ? imageSource
      : `data:image/jpeg;base64,${imageSource}`;

    const response = await this.openai.chat.completions.create({
      model: this.model,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: imageUrlContent,
                detail: 'high'
              }
            }
          ]
        }
      ],
      temperature: 0.1
    });

    const content = response.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);
    return NequiOcrExtractionSchema.parse(parsed);
  }
}
