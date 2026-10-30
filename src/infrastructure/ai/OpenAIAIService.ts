import OpenAI from 'openai';
import { IAIService, AIResponse, ToolCallResult } from '../../application/ports/IAIService.js';
import { ChatMessage } from '../../domain/repositories/IConversationRepository.js';
import { SYSTEM_PROMPT } from '../config/systemPrompt.js';
import { AI_TOOLS_DEFINITIONS } from './ToolDefinitions.js';
import { ToolExecutor } from './ToolExecutor.js';

export class OpenAIAIService implements IAIService {
  private openai: OpenAI;
  private model: string;
  private toolExecutor: ToolExecutor;

  constructor(apiKey: string, model: string = 'gpt-4o', toolExecutor: ToolExecutor) {
    this.openai = new OpenAI({ apiKey });
    this.model = model;
    this.toolExecutor = toolExecutor;
  }

  public async generateReply(
    history: ChatMessage[],
    userMessage: string,
    imageUrl?: string
  ): Promise<AIResponse> {
    const executedTools: ToolCallResult[] = [];

    // Formatear historial a mensajes de OpenAI
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT }
    ];

    for (const msg of history) {
      if (msg.role === 'user') {
        if (msg.imageUrl) {
          messages.push({
            role: 'user',
            content: [
              { type: 'text', text: msg.content || 'Adjunto imagen del comprobante.' },
              {
                type: 'image_url',
                image_url: { url: msg.imageUrl }
              }
            ]
          });
        } else {
          messages.push({ role: 'user', content: msg.content });
        }
      } else if (msg.role === 'assistant') {
        messages.push({ role: 'assistant', content: msg.content });
      }
    }

    // Mensaje actual del usuario
    if (imageUrl) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: userMessage || 'Aquí está la foto de mi comprobante Nequi.' },
          {
            type: 'image_url',
            image_url: { url: imageUrl }
          }
        ]
      });
    } else {
      messages.push({ role: 'user', content: userMessage });
    }

    let iterations = 0;
    const maxIterations = 5;

    while (iterations < maxIterations) {
      iterations++;

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages,
        tools: AI_TOOLS_DEFINITIONS,
        tool_choice: 'auto',
        temperature: 0.2
      });

      const responseMessage = response.choices[0]?.message;
      if (!responseMessage) {
        return {
          message: 'Lo siento, no pude procesar tu solicitud en este momento. Por favor intenta de nuevo.',
          toolCalls: executedTools
        };
      }

      messages.push(responseMessage);

      // Si el LLM pide ejecutar herramientas (Tool Calls)
      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        for (const toolCall of responseMessage.tool_calls) {
          if (toolCall.type !== 'function') continue;
          const functionName = toolCall.function.name;
          let parsedArgs = {};
          try {
            parsedArgs = JSON.parse(toolCall.function.arguments);
          } catch (e) {
            console.error('Error al parsear argumentos de la función:', e);
          }

          let toolOutput: any;
          try {
            toolOutput = await this.toolExecutor.executeTool(functionName, parsedArgs);
          } catch (error: any) {
            toolOutput = { error: error.message };
          }

          executedTools.push({
            toolName: functionName,
            args: parsedArgs,
            result: toolOutput
          });

          // Agregar respuesta de la herramienta al contexto del LLM
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolOutput)
          });
        }
        // Continuar el loop para que el modelo genere la respuesta final al cliente
        continue;
      }

      // Si no hay más tool calls, retornar la respuesta textual final
      return {
        message: responseMessage.content || '',
        toolCalls: executedTools
      };
    }

    return {
      message: 'Tu pedido está siendo gestionado. Un asesor de Antojitos te responderá en breve. 🍓',
      toolCalls: executedTools
    };
  }
}
