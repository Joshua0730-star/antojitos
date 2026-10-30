import { IWhatsAppService } from '../../application/ports/IWhatsAppService.js';

export interface CloudApiConfig {
  phoneNumberId: string;
  accessToken: string;
  kitchenPhoneNumber: string;
}

export class CloudApiWhatsAppAdapter implements IWhatsAppService {
  private readonly baseUrl: string;

  constructor(private readonly config: CloudApiConfig) {
    this.baseUrl = `https://graph.facebook.com/v21.0/${this.config.phoneNumberId}/messages`;
  }

  /**
   * WhatsApp usernames are represented in the Business Platform by a BSUID.
   * A BSUID is not a phone number and must never be stripped to digits. The
   * `recipient` field is used for BSUIDs; `to` remains the phone-number path.
   */
  private recipient(to: string): { to?: string; recipient?: string } {
    const value = String(to || '').trim();
    const digits = value.replace(/\D/g, '');
    const looksLikeBusinessScopedUserId = /^[A-Z]{2}(?:\.ENT)?\.[A-Za-z0-9]+$/i.test(value);
    if (digits.length >= 7 && !value.includes('@') && !looksLikeBusinessScopedUserId) return { to: digits };
    return value ? { recipient: value } : {};
  }

  public async sendMessage(to: string, text: string): Promise<boolean> {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          ...this.recipient(to),
          type: 'text',
          text: { preview_url: false, body: text }
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('WhatsApp Cloud API Error:', errorData);
        return false;
      }
      return true;
    } catch (error) {
      console.error('Error al enviar mensaje WhatsApp Cloud API:', error);
      return false;
    }
  }

  public async sendImage(to: string, imageUrl: string, caption?: string): Promise<boolean> {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          type: 'image',
          image: { link: imageUrl, caption },
          ...this.recipient(to)
        })
      });
      return response.ok;
    } catch (error) {
      console.error('Error al enviar imagen por WhatsApp Cloud API:', error);
      return false;
    }
  }

  public async sendDocument(to: string, documentUrl: string, filename: string, caption?: string): Promise<boolean> {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.config.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', ...this.recipient(to), type: 'document', document: { link: documentUrl, filename, caption } })
      });
      return response.ok;
    } catch (error) { console.error('Error al enviar documento por WhatsApp Cloud API:', error); return false; }
  }

  public async sendKitchenAlert(message: string): Promise<boolean> {
    return this.sendMessage(this.config.kitchenPhoneNumber, message);
  }

  public async getMediaDataUrl(mediaIdOrUrl: string): Promise<string> {
    if (!mediaIdOrUrl) return '';
    if (mediaIdOrUrl.startsWith('http://') || mediaIdOrUrl.startsWith('https://') || mediaIdOrUrl.startsWith('data:')) {
      return mediaIdOrUrl;
    }

    try {
      // 1. Consultar URL del recurso multimedia a la API de Meta Graph
      const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaIdOrUrl}`, {
        headers: { 'Authorization': `Bearer ${this.config.accessToken}` }
      });

      if (!metaRes.ok) {
        console.error('Error obteniendo metadata de media WhatsApp:', await metaRes.text());
        return mediaIdOrUrl;
      }

      const metaJson = (await metaRes.json()) as { url?: string; mime_type?: string };
      const downloadUrl = metaJson.url;
      const mimeType = metaJson.mime_type || 'image/jpeg';

      if (!downloadUrl) return mediaIdOrUrl;

      // 2. Descargar la imagen usando el Token de Autorización de Meta
      const imgRes = await fetch(downloadUrl, {
        headers: { 'Authorization': `Bearer ${this.config.accessToken}` }
      });

      if (imgRes.ok) {
        const arrayBuffer = await imgRes.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        return `data:${mimeType};base64,${base64}`;
      }
    } catch (error) {
      console.error('Error al descargar multimedia de Meta Cloud API:', error);
    }

    return mediaIdOrUrl;
  }

  public async markAsRead(messageId: string, _details?: { remoteJid: string; remoteJidAlt?: string; fromMe: boolean }): Promise<boolean> {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId
        })
      });

      return response.ok;
    } catch (error) {
      console.error('Error marcando mensaje como leído en WhatsApp Cloud API:', error);
      return false;
    }
  }
}
