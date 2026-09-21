import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { IAIService, AIResponse, ToolCallResult } from '../../application/ports/IAIService.js';
import { ChatMessage } from '../../domain/repositories/IConversationRepository.js';
import { SYSTEM_PROMPT } from '../config/systemPrompt.js';
import { ToolExecutor } from './ToolExecutor.js';

export class GeminiAIService implements IAIService {
  private genAI: GoogleGenerativeAI;
  private modelName: string;
  private toolExecutor: ToolExecutor;

  constructor(apiKey: string, modelName: string = 'gemini-2.0-flash', toolExecutor: ToolExecutor) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.modelName = modelName;
    this.toolExecutor = toolExecutor;
  }

  public async generateReply(
    history: ChatMessage[],
    userMessage: string,
    imageUrl?: string
  ): Promise<AIResponse> {
    const executedTools: ToolCallResult[] = [];

    const model = this.genAI.getGenerativeModel({
      model: this.modelName,
      systemInstruction: SYSTEM_PROMPT,
      tools: [
        {
          functionDeclarations: [
            {
              name: 'obtener_catalogo',
              description: 'Retorna la lista de productos disponibles, categorías, precios y opciones de personalización de Antojitos.',
              parameters: {
                type: SchemaType.OBJECT,
                properties: {}
              }
            },
            {
              name: 'validar_comprobante_nequi',
              description: 'Valida un comprobante de pago Nequi analizando la imagen vía OCR, comprobando monto, fecha y unicidad de referencia.',
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  image_url: { type: SchemaType.STRING },
                  monto_esperado: { type: SchemaType.NUMBER }
                },
                required: ['image_url', 'monto_esperado']
              }
            },
            {
              name: 'notificar_cocina',
              description: 'Envía el pedido confirmado al canal de cocina de WhatsApp.',
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  resumen_pedido_formatted: { type: SchemaType.STRING },
                  detalles_json: { type: SchemaType.OBJECT, properties: {} }
                },
                required: ['resumen_pedido_formatted', 'detalles_json']
              }
            }
          ]
        }
      ]
    });

    const chat = model.startChat({
      history: history.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }))
    });

    let currentPromptParts: any[] = [{ text: userMessage }];

    if (imageUrl) {
      let base64 = imageUrl;
      let mime = 'image/jpeg';
      if (imageUrl.startsWith('data:')) {
        const parts = imageUrl.split(',');
        const match = parts[0].match(/:(.*?);/);
        if (match) mime = match[1];
        base64 = parts[1];
      }
      currentPromptParts.push({
        inlineData: {
          data: base64,
          mimeType: mime
        }
      });
    }

    let result = await chat.sendMessage(currentPromptParts);
    let functionCalls = result.response.functionCalls();

    let iterations = 0;
    while (functionCalls && functionCalls.length > 0 && iterations < 5) {
      iterations++;
      const call = functionCalls[0];
      const functionName = call.name;
      const functionArgs = call.args;

      let toolOutput: any;
      try {
        toolOutput = await this.toolExecutor.executeTool(functionName, functionArgs);
      } catch (e: any) {
        toolOutput = { error: e.message };
      }

      executedTools.push({
        toolName: functionName,
        args: functionArgs,
        result: toolOutput
      });

      result = await chat.sendMessage([
        {
          functionResponse: {
            name: functionName,
            response: toolOutput
          }
        }
      ]);

      functionCalls = result.response.functionCalls();
    }

    return {
      message: result.response.text(),
      toolCalls: executedTools
    };
  }
}
