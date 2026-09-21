import { IAIService, AIResponse, ToolCallResult } from '../../application/ports/IAIService.js';
import { ChatMessage } from '../../domain/repositories/IConversationRepository.js';
import { ToolExecutor } from './ToolExecutor.js';

export class MockAIService implements IAIService {
  constructor(private readonly toolExecutor: ToolExecutor) {}

  public async generateReply(
    history: ChatMessage[],
    userMessage: string,
    imageUrl?: string
  ): Promise<AIResponse> {
    const executedTools: ToolCallResult[] = [];
    const lower = userMessage.toLowerCase();

    // Detección de paso o intención básica para pruebas sin LLM externo
    if (lower.includes('hola') || lower.includes('menu') || lower.includes('menú') || history.length === 0) {
      const catalog = await this.toolExecutor.executeTool('obtener_catalogo', {});
      executedTools.push({
        toolName: 'obtener_catalogo',
        args: {},
        result: catalog
      });

      return {
        message: `¡Hola! Bienvenido a *Antojitos* 🍓🍧 Soy AntojitoBot, tu asistente virtual.
¿Qué delicia te gustaría ordenar hoy?

1️⃣ *Fresas con Crema Especiales* (Personal $12.000 / Grande $16.000)
2️⃣ *Oblea la Especial* ($7.000)
3️⃣ *Ensalada de Frutas Especial* ($14.000)

Dime qué se te antoja y te ayudaré con tu pedido paso a paso. 😊`,
        toolCalls: executedTools
      };
    }

    if (lower.includes('fresa') || lower.includes('oblea') || lower.includes('ensalada')) {
      return {
        message: `¡Excelente elección! 🍓
Para tus *Fresas con Crema Especiales*:
¿Las deseas en tamaño *Personal* ($12.000) o *Grande* ($16.000)?
Puedes elegir hasta 2 toppings: ChocoKrispis, Mani, Queso o Chispas de Chocolate.`,
        toolCalls: executedTools
      };
    }

    if (lower.includes('personal') || lower.includes('grande') || lower.includes('topping')) {
      return {
        message: `¡Perfecto! Anotado. 📝
Ahora, por favor indícame tus datos de entrega:
1. Nombre de quien recibe
2. Dirección exacta + Barrio o Municipio + Apto/Piso
3. ¿Es a domicilio 🛵 o pasas a recoger al local?`,
        toolCalls: executedTools
      };
    }

    if (lower.includes('cra') || lower.includes('calle') || lower.includes('domicilio') || lower.includes('recoger')) {
      return {
        message: `¡Listo! Aquí tienes el resumen de tu pedido:
------------------------------------
• 1x Fresas con Crema Especiales (Grande) con Queso y ChocoKrispis: $16.000
• Domicilio: $0
*TOTAL A PAGAR: $16.000 COP*
------------------------------------
¿Cómo deseas pagar?
A) *Efectivo contra entrega* 💵 (Indícame con cuánto billete pagarás)
B) *Nequi* 📱 (Te enviaré nuestro número para transferir)`,
        toolCalls: executedTools
      };
    }

    // Flujo Nequi / Imagen de comprobante
    if (imageUrl || lower.includes('comprobante') || lower.includes('transferencia') || lower.includes('nequi')) {
      const mockImg = imageUrl || 'mock_comprobante_16000.jpg';
      const validationResult = await this.toolExecutor.executeTool('validar_comprobante_nequi', {
        image_url: mockImg,
        monto_esperado: 16000
      });

      executedTools.push({
        toolName: 'validar_comprobante_nequi',
        args: { image_url: mockImg, monto_esperado: 16000 },
        result: validationResult
      });

      if (validationResult.exito) {
        // Enviar a cocina
        const kitchenResult = await this.toolExecutor.executeTool('notificar_cocina', {
          resumen_pedido_formatted: '',
          detalles_json: {
            cliente: {
              nombre: 'Cliente Prueba',
              telefono: '+573001234567',
              tipo_entrega: 'DOMICILIO',
              direccion: 'Cra 15 # 45-20',
              barrio_municipio: 'Centro'
            },
            items: [
              {
                id_producto: 'fresas_crema_std',
                nombre: 'Fresas con Crema Especiales',
                precio_base: 12000,
                cantidad: 1,
                tamano: { nombre: 'Grande', adicional: 4000 },
                toppings: ['Queso', 'ChocoKrispis']
              }
            ],
            metodo_pago: 'NEQUI',
            referencia_nequi: validationResult.referencia
          }
        });

        executedTools.push({
          toolName: 'notificar_cocina',
          args: {},
          result: kitchenResult
        });

        return {
          message: `¡Comprobante Nequi verificado con éxito! ✅ (Ref: ${validationResult.referencia}).

Tu pedido ha sido confirmado y enviado a nuestra cocina 🍓👨‍🍳 (Orden #${kitchenResult.orden_id}).
Tiempo estimado de entrega: 25 a 40 minutos. ¡Muchas gracias por tu compra en Antojitos!`,
          toolCalls: executedTools
        };
      } else {
        return {
          message: `Hubo un inconveniente con el comprobante: ${validationResult.mensaje}
Por favor revisa y envía nuevamente la captura de tu transferencia Nequi. 📱`,
          toolCalls: executedTools
        };
      }
    }

    if (lower.includes('efectivo') || lower.includes('billete') || lower.includes('50') || lower.includes('20')) {
      const kitchenResult = await this.toolExecutor.executeTool('notificar_cocina', {
        resumen_pedido_formatted: '',
        detalles_json: {
          cliente: {
            nombre: 'Cliente Efectivo',
            telefono: '+573001234567',
            tipo_entrega: 'DOMICILIO',
            direccion: 'Calle 10 # 5-20',
            barrio_municipio: 'Centro'
          },
          items: [
            {
              id_producto: 'fresas_crema_std',
              nombre: 'Fresas con Crema Especiales',
              precio_base: 12000,
              cantidad: 1,
              tamano: { nombre: 'Grande', adicional: 4000 },
              toppings: ['Queso', 'Mani']
            }
          ],
          metodo_pago: 'EFECTIVO',
          paga_con_billete: 20000
        }
      });

      executedTools.push({
        toolName: 'notificar_cocina',
        args: {},
        result: kitchenResult
      });

      return {
        message: `¡Excelente! Pedido confirmado con pago en *Efectivo contra entrega* 💵 (Orden #${kitchenResult.orden_id}).
Llevaremos tu cambio correspondiente. Tu pedido ya está en preparación en cocina 🍓🛵.
Tiempo estimado: 25 a 40 minutos. ¡Gracias por elegir Antojitos!`,
        toolCalls: executedTools
      };
    }

    return {
      message: `¡Entendido! Con gusto te colaboro. Si deseas ver los productos disponibles, solo escribe *menú*. 🍓`,
      toolCalls: executedTools
    };
  }
}
