import { IWhatsAppService } from '../../application/ports/IWhatsAppService.js';

export interface EvolutionApiConfig {
  baseUrl: string;
  apiKey: string;
  instance: string;
  kitchenPhoneNumber: string;
}

/**
 * Evolution API adapter. Keeps provider-specific HTTP details outside the application layer.
 */
export class EvolutionApiWhatsAppAdapter implements IWhatsAppService {
  private readonly baseUrl: string;

  constructor(private readonly config: EvolutionApiConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
  }

  private headers(): Record<string, string> {
    return {
      apikey: this.config.apiKey,
      'Content-Type': 'application/json'
    };
  }

  private number(to: string): string {
    const value = to.trim();
    // Evolution admite JID/LID para contactos que no exponen el teléfono
    // (p. ej. `...@lid`). Conservarlo permite pedir el número sin perder la
    // conversación; los números normales siguen normalizándose igual.
    if (value.includes('@')) return value;
    const digits = value.replace(/\D/g, '');
    // Algunos eventos de Evolution exponen un identificador de usuario sin
    // sufijo @lid. No convertirlo a una cadena vacía/incorrecta: conservar el
    // identificador permite que Evolution intente resolver el contacto.
    return digits.length >= 7 ? digits : value;
  }

  public async sendMessage(to: string, text: string): Promise<boolean> {
    return this.request(`/message/sendText/${encodeURIComponent(this.config.instance)}`, {
      number: this.number(to),
      text
    });
  }

  public async sendImage(to: string, imageUrl: string, caption?: string): Promise<boolean> {
    return this.request(`/message/sendMedia/${encodeURIComponent(this.config.instance)}`, {
      number: this.number(to),
      mediatype: 'image',
      media: imageUrl,
      caption: caption || ''
    });
  }

  public async sendDocument(to: string, documentUrl: string, filename: string, caption?: string): Promise<boolean> {
    return this.request(`/message/sendMedia/${encodeURIComponent(this.config.instance)}`, {
      number: this.number(to), mediatype: 'document', media: documentUrl,
      fileName: filename, caption: caption || ''
    });
  }

  public async sendKitchenAlert(message: string): Promise<boolean> {
    return this.sendMessage(this.config.kitchenPhoneNumber, message);
  }

  public async getMediaDataUrl(mediaIdOrUrl: string): Promise<string> {
    return mediaIdOrUrl || '';
  }

  public async markAsRead(messageId: string, details?: { remoteJid: string; remoteJidAlt?: string; fromMe: boolean }): Promise<boolean> {
    return this.request(`/chat/markMessageAsRead/${encodeURIComponent(this.config.instance)}`, {
      readMessages: [{
        id: messageId,
        remoteJid: details?.remoteJidAlt || details?.remoteJid || '',
        fromMe: details?.fromMe ?? false
      }]
    });
  }

  private async request(path: string, body: unknown): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8_000)
      });

      if (!response.ok) {
        console.error('Evolution API Error:', await response.text());
      }
      return response.ok;
    } catch (error) {
      console.error('Error comunicando con Evolution API:', error);
      return false;
    }
  }
}
