import { Request, Response } from 'express';
import { ProcessIncomingMessageUseCase } from '../../application/use-cases/ProcessIncomingMessageUseCase.js';
import { IWhatsAppService } from '../../application/ports/IWhatsAppService.js';
import { IdempotencyService } from '../../application/services/IdempotencyService.js';
import { MessageDebouncerService } from '../../application/services/MessageDebouncerService.js';
import { CoexistenceService } from '../../application/services/CoexistenceService.js';
import { ENV } from '../../infrastructure/config/env.js';
import { OperatingScheduleService } from '../../application/services/OperatingScheduleService.js';
import { IAudioTranscriptionService } from '../../application/ports/IAudioTranscriptionService.js';
import crypto from 'node:crypto';

export class WhatsAppWebhookController {
  constructor(
    private readonly processIncomingMessageUseCase: ProcessIncomingMessageUseCase,
    private readonly whatsAppService?: IWhatsAppService,
    private readonly idempotencyService?: IdempotencyService,
    private readonly debouncerService?: MessageDebouncerService,
    private readonly coexistenceService?: CoexistenceService,
    private readonly operatingSchedule?: OperatingScheduleService,
    private readonly audioTranscriptionService?: IAudioTranscriptionService
  ) {}

  private hasValidCloudSignature(req: Request): boolean {
    if (ENV.WHATSAPP_PROVIDER !== 'cloud_api') return true;
    const secret = ENV.WHATSAPP_APP_SECRET;
    const signature = req.get('x-hub-signature-256') || '';
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!secret || !rawBody || !signature.startsWith('sha256=')) return false;
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const presented = signature.slice('sha256='.length);
    return presented.length === expected.length && crypto.timingSafeEqual(
      Buffer.from(presented, 'utf8'), Buffer.from(expected, 'utf8')
    );
  }

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
      if (!this.hasValidCloudSignature(req)) {
        res.status(401).send('Firma de webhook inválida');
        return;
      }
      const body = req.body;

      // Telemetría segura: solo metadatos del evento, nunca texto, teléfonos,
      // imágenes, tokens ni payloads completos.
      console.log('[webhook] event metadata', {
        event: typeof body?.event === 'string' ? body.event : 'unknown',
        hasKey: Boolean(body?.data?.key),
        fromMe: body?.data?.key?.fromMe === true,
        jidType: typeof body?.data?.key?.remoteJid === 'string'
          ? body.data.key.remoteJid.endsWith('@g.us') ? 'group' : 'direct'
          : 'unknown',
        messageType: body?.data?.messageType || body?.data?.message?.conversation ? 'text-like' : 'other'
      });

      // Responder 200 OK inmediatamente a Meta/WhatsApp para evitar reintentos
      res.status(200).send('EVENT_RECEIVED');

      // 0. Formato Evolution API (messages.upsert). Evolution usa Baileys y
      // entrega el mensaje dentro de data.key/data.message, a diferencia del
      // formato entry/changes de Cloud API. Normalizamos solo mensajes entrantes.
      if ((body.event === 'messages.upsert' || (body.data?.key && body.data?.message)) && body.data?.key) {
        const key = body.data.key;
        const remoteJid = String(key.remoteJid || '');

        // Nunca procesar grupos. El bot queda completamente silencioso para
        // cualquier JID terminado en @g.us, incluso si lo mencionan.
        if (remoteJid.endsWith('@g.us')) return;

        // Un mensaje enviado desde la app móvil por un encargado debe pausar
        // solo esta conversación. Los mensajes enviados por el bot también
        // llevan fromMe=true, por eso usamos el `source` de Evolution para
        // distinguir las apps humanas de los envíos hechos por la API.
        if (key.fromMe) {
          const source = String(body.data.source || body.data.origin || body.source || '').toLowerCase();
          if (this.coexistenceService && ENV.EVOLUTION_HUMAN_SOURCES.includes(source)) {
            const customerIdentity = String(
              key.remoteJidAlt || key.participantAlt || key.senderPn ||
              (remoteJid.includes('@') ? remoteJid.split('@')[0] : remoteJid)
            ).trim();
            const rawHumanMessage = body.data.message || {};
            const humanMessage = rawHumanMessage.ephemeralMessage?.message || rawHumanMessage.viewOnceMessage?.message || rawHumanMessage;
            const humanText = humanMessage.conversation || humanMessage.extendedTextMessage?.text || humanMessage.imageMessage?.caption || '';
            if (customerIdentity) await this.coexistenceService.registerHumanEcho(customerIdentity, humanText);
          }
          this.operatingSchedule?.handleOperatorCommand(String(body.data.message?.conversation || ''));
          return;
        }

        // Evolution puede entregar LIDs (por ejemplo `...@lid`) cuando el
        // contacto escribe desde una cuenta con nombre de usuario. En ese
        // caso el teléfono real suele venir en remoteJidAlt. Nunca usemos el
        // nombre mostrado como si fuera un teléfono: para pedidos debemos
        // solicitarlo explícitamente si WhatsApp no lo entrega.
        const remoteJidAlt = String(
          key.remoteJidAlt || key.participantAlt || key.senderPn ||
          body.data.remoteJidAlt || body.data.senderPn || ''
        );
        const candidates = [
          remoteJidAlt,
          String(key.participant || ''),
          String(key.senderPn || ''),
          remoteJid,
          String(body.data.sender || '')
        ];
        const phoneCandidate = candidates
          // Los LID no son teléfonos. Solo aceptamos un JID telefónico o un
          // valor alternativo explícitamente numérico.
          .filter(value => !value.toLowerCase().endsWith('@lid'))
          .map(value => value.split('@')[0].replace(/\D/g, ''))
          .find(value => value.length >= 7);
        const deliveryJid = remoteJid || remoteJidAlt;
        let from = phoneCandidate || deliveryJid;
        const rawEvolutionMessage = body.data.message || {};
        const evolutionMessage = rawEvolutionMessage.ephemeralMessage?.message
          || rawEvolutionMessage.viewOnceMessage?.message
          || rawEvolutionMessage;
        const userText =
          evolutionMessage.conversation ||
          evolutionMessage.extendedTextMessage?.text ||
          evolutionMessage.imageMessage?.caption ||
          '';
        // Si el cliente responde con su número desde un LID, úsalo como
        // identidad operativa del pedido a partir de este turno.
        const hasTypedPhone = /(?:\+?\d[\d\s().-]{6,}\d)/.test(userText);
        if (!phoneCandidate && hasTypedPhone) {
          const typedPhone = userText.match(/(?:\+?\d[\d\s().-]{6,}\d)/)?.[0]?.replace(/\D/g, '');
          if (typedPhone && typedPhone.length >= 7) from = typedPhone;
        }
        const imageBase64 = evolutionMessage.base64 || evolutionMessage.imageMessage?.base64;
        const imageUrl = imageBase64
          ? (String(imageBase64).startsWith('data:') ? String(imageBase64) : `data:image/jpeg;base64,${imageBase64}`)
          : evolutionMessage.imageMessage?.url;
        const messageId = key.id;

        if (!from) return;
        if (this.idempotencyService && messageId) {
          const isNew = await this.idempotencyService.markIfNew(messageId);
          if (!isNew) return;
        }
        if (this.whatsAppService?.markAsRead && messageId) {
          this.whatsAppService.markAsRead(messageId, {
            remoteJid: String(key.remoteJid || ''),
            remoteJidAlt: String(key.remoteJidAlt || ''),
            fromMe: Boolean(key.fromMe)
          }).catch(() => {});
        }
        if (this.coexistenceService) {
          const decision = await this.coexistenceService.evaluateAccess(from, userText);
          if (!decision.canRespond) {
            if (!decision.isCommandHandled) {
              await this.coexistenceService.recordSuppressedCustomerMessage(from, userText, imageUrl);
            }
            return;
          }
        }
        if (this.operatingSchedule && !this.operatingSchedule.isOpen()) {
          // Fuera de horario el webhook debe quedar silencioso: no enviamos
          // respuesta propia ni encolamos el mensaje. WhatsApp Business queda
          // libre para aplicar su mensaje automático de ausencia.
          return;
        }

        if (this.debouncerService) {
          await this.debouncerService.enqueueMessage({ from, text: userText, imageUrl, messageId });
          console.log('[webhook] inbound message queued');
        } else {
          await this.processIncomingMessageUseCase.execute({ from, text: userText, imageUrl });
        }
        return;
      }

      // 1. Detección de formato oficial de WhatsApp Cloud API
      const entry = body.entry?.[0];
      const change = entry?.changes?.[0];
      const field = change?.field;
      const value = change?.value;

      // 1.1 MANEJO DE ECHOES (Mensajes del operador desde la App Móvil de WhatsApp Business)
      // Meta envía field === 'smb_message_echoes' con value.message_echoes o mensajes cuyo emisor es el número del negocio
      const isEchoField = field === 'smb_message_echoes';
      const rawMessage = value?.message_echoes?.[0] || value?.messages?.[0];
      const cleanBusinessPhone = ENV.BUSINESS_PHONE_NUMBER.replace(/\D/g, '');

      const isBusinessSender =
        rawMessage &&
        cleanBusinessPhone &&
        (rawMessage.from?.replace(/\D/g, '') === cleanBusinessPhone ||
          rawMessage.sender?.replace(/\D/g, '') === cleanBusinessPhone);

      if (isEchoField || isBusinessSender) {
        const targetCustomerPhone = rawMessage?.to || rawMessage?.recipient_id ||
          rawMessage?.to_user_id || rawMessage?.recipient_user_id || rawMessage?.from_user_id || rawMessage?.from;
        if (targetCustomerPhone && this.coexistenceService) {
          const textBody = rawMessage?.text?.body || '';

          // Si el operador escribió un comando especial
          if (textBody.trim().toLowerCase() === '!bot on' || textBody.trim().toLowerCase() === '!bot off') {
            await this.coexistenceService.handleCommand(targetCustomerPhone, textBody);
          } else {
            this.operatingSchedule?.handleOperatorCommand(textBody);
            // Operador humano respondiendo manualmente
            await this.coexistenceService.registerHumanEcho(targetCustomerPhone, textBody);
          }
        }
        return;
      }

      // 1.2 Procesamiento de mensajes entrantes del cliente
      if (value?.messages && value.messages.length > 0) {
        const message = value.messages[0];
        const messageId = message.id;
        // Desde el despliegue gradual de usernames, Meta puede omitir `from`
        // como teléfono y entregar únicamente el BSUID (`from_user_id` o
        // `contacts[].user_id`). Ese identificador sí es enrutable y debe
        // conservarse de extremo a extremo.
        const contact = Array.isArray(value.contacts)
          ? value.contacts.find((item: any) => item?.wa_id === message.from) || value.contacts[0]
          : undefined;
        const phoneFrom = [message.from, contact?.wa_id]
          .map((candidate: unknown) => String(candidate || '').trim())
          .filter((candidate: string) => !/^[A-Z]{2}(?:\.ENT)?\.[A-Za-z0-9]+$/i.test(candidate))
          .map((candidate: string) => candidate.replace(/\D/g, ''))
          .find((candidate: string) => candidate.length >= 7);
        const businessScopedUserId = String(
          message.from_user_id || message.user_id || contact?.user_id || contact?.parent_user_id || ''
        ).trim();
        // Preferir BSUID cuando Meta lo entrega evita partir la conversación
        // en dos claves distintas si el teléfono aparece solo en algunos
        // webhooks o deja de compartirse por privacidad.
        const from = businessScopedUserId || phoneFrom || String(message.from || '').trim();
        if (!from) return;

        // Idempotencia: evitar procesar el mismo wamid duplicado
        if (this.idempotencyService && messageId) {
          const isNew = await this.idempotencyService.markIfNew(messageId);
          if (!isNew) {
            return;
          }
        }

        // Marcar como leído en WhatsApp (dos checks azules)
        if (this.whatsAppService?.markAsRead && messageId) {
          this.whatsAppService.markAsRead(messageId).catch(() => {});
        }

        // Detección de comandos de operador/cliente (!bot on / !bot off)
        const incomingText = message.text?.body || '';
        if (
          this.coexistenceService &&
          (incomingText.trim().toLowerCase() === '!bot on' || incomingText.trim().toLowerCase() === '!bot off')
        ) {
          await this.coexistenceService.handleCommand(from, incomingText);
          return;
        }

        // Detección de llamadas entrantes
        if (message.type === 'call' || body.event === 'call') {
          if (this.debouncerService) {
            await this.debouncerService.enqueueMessage({
              from,
              isCallEvent: true,
              messageId
            });
          } else {
            await this.processIncomingMessageUseCase.execute({
              from,
              isCallEvent: true
            });
          }
          return;
        }

        let userText = '';
        let imageUrl: string | undefined;

        // Audio is converted to short text before entering the normal order
        // pipeline. Unsupported/failed audio never reaches the AI model.
        if (message.type === 'audio' || message.audio || message.audioMessage) {
          const audio = message.audio || message.audioMessage || {};
          const rawAudio = audio.id || audio.url || audio.mediaUrl;
          const audioUrl = rawAudio && this.whatsAppService?.getMediaDataUrl
            ? await this.whatsAppService.getMediaDataUrl(rawAudio)
            : rawAudio;
          userText = this.audioTranscriptionService && audioUrl
            ? (await this.audioTranscriptionService.transcribe(audioUrl, audio.mime_type || audio.mimetype || 'audio/ogg') || '')
            : '';
          if (!userText) {
            await this.whatsAppService?.sendMessage(from, 'No pude leer el audio de forma segura. Por favor envíame tu pedido escrito y te ayudo de inmediato. 🍓');
            return;
          }
        }

        if (message.type === 'text') {
          userText = message.text?.body || '';
        } else if (message.type === 'image') {
          userText = message.image?.caption || '';
          const rawMediaId = message.image?.id || message.image?.url;
          if (rawMediaId && this.whatsAppService?.getMediaDataUrl) {
            imageUrl = await this.whatsAppService.getMediaDataUrl(rawMediaId);
          } else {
            imageUrl = rawMediaId;
          }
        }

        // Si el servicio de coexistencia indica que el bot está silenciado (ej. humano atendiendo)
        if (this.coexistenceService) {
          const decision = await this.coexistenceService.evaluateAccess(from, userText);
          if (!decision.canRespond) {
            if (!decision.isCommandHandled) {
              await this.coexistenceService.recordSuppressedCustomerMessage(from, userText, imageUrl);
            }
            return;
          }
        }
        if (this.operatingSchedule && !this.operatingSchedule.isOpen()) {
          // No consumir IA ni responder desde el bot fuera del horario. La
          // respuesta, si está configurada, la gestiona WhatsApp Business.
          return;
        }

        // Encolar en el debouncer de procesamiento por lotes
        if (this.debouncerService) {
          await this.debouncerService.enqueueMessage({
            from,
            text: userText,
            imageUrl,
            messageId
          });
        } else {
          await this.processIncomingMessageUseCase.execute({
            from,
            text: userText,
            imageUrl
          });
        }
        return;
      }

      // 2. Soporte para formato simulador / webhook personalizado
      if (body.from && (body.text || body.imageUrl || body.isCallEvent)) {
        if (
          this.coexistenceService &&
          (body.text?.trim().toLowerCase() === '!bot on' || body.text?.trim().toLowerCase() === '!bot off')
        ) {
          await this.coexistenceService.handleCommand(body.from, body.text);
          return;
        }

        if (this.coexistenceService) {
          const decision = await this.coexistenceService.evaluateAccess(body.from, body.text);
          if (!decision.canRespond) {
            if (!decision.isCommandHandled) {
              await this.coexistenceService.recordSuppressedCustomerMessage(body.from, body.text || '', body.imageUrl);
            }
            return;
          }
        }

        if (this.operatingSchedule && !this.operatingSchedule.isOpen()) {
          return;
        }

        if (this.debouncerService) {
          await this.debouncerService.enqueueMessage({
            from: body.from,
            text: body.text,
            imageUrl: body.imageUrl,
            isCallEvent: body.isCallEvent
          });
        } else {
          await this.processIncomingMessageUseCase.execute({
            from: body.from,
            text: body.text,
            imageUrl: body.imageUrl,
            isCallEvent: body.isCallEvent
          });
        }
      }
    } catch (error) {
      console.error('Error procesando webhook de WhatsApp:', error);
    }
  }
}
