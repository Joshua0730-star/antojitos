import { Request, Response } from 'express';
import { ProcessIncomingMessageUseCase } from '../../application/use-cases/ProcessIncomingMessageUseCase.js';
import { ENV } from '../../infrastructure/config/env.js';

export class WhatsAppWebhookController {
  constructor(private readonly processIncomingMessageUseCase: ProcessIncomingMessageUseCase) {}

  /**
   * Verificación del Webhook por parte de Meta WhatsApp Cloud API (GET /webhook)
   */
  public verify(req: Request, res: Response): void {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === ENV.WHATSAPP_VERIFY_TOKEN) {
      res.status(200).send(challenge);
      return;
    }

    res.status(403).send('Token de verificación inválido');
  }

  /**
   * Recepción de eventos y mensajes de WhatsApp (POST /webhook)
   */
  public async handleWebhook(req: Request, res: Response): Promise<void> {
    try {
      const body = req.body;

      // Responder 200 OK inmediatamente a WhatsApp para evitar reintentos del webhook
      res.status(200).send('EVENT_RECEIVED');

      // 1. Detección de formato WhatsApp Cloud API
      const entry = body.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;

      if (value?.messages && value.messages.length > 0) {
        const message = value.messages[0];
        const from = message.from;

        // Detección de llamadas entrantes o eventos multimedia
        if (message.type === 'call' || body.event === 'call') {
          await this.processIncomingMessageUseCase.execute({
            from,
            isCallEvent: true
          });
          return;
        }

        let userText = '';
        let imageUrl: string | undefined;

        if (message.type === 'text') {
          userText = message.text?.body || '';
        } else if (message.type === 'image') {
          userText = message.image?.caption || '';
          imageUrl = message.image?.id || message.image?.url;
        }

        await this.processIncomingMessageUseCase.execute({
          from,
          text: userText,
          imageUrl
        });
        return;
      }

      // 2. Soporte para formato simplificado / Evolution API / Webhook personalizado
      if (body.from && (body.text || body.imageUrl || body.isCallEvent)) {
        await this.processIncomingMessageUseCase.execute({
          from: body.from,
          text: body.text,
          imageUrl: body.imageUrl,
          isCallEvent: body.isCallEvent
        });
      }
    } catch (error) {
      console.error('Error procesando webhook de WhatsApp:', error);
    }
  }
}
