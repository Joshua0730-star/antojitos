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

  public async sendMessage(to: string, text: string): Promise<boolean> {
    try {
      const cleanPhone = to.replace(/\D/g, '');
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanPhone,
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
      const cleanPhone = to.replace(/\D/g, '');
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanPhone,
          type: 'image',
          image: { link: imageUrl, caption }
        })
      });
      return response.ok;
    } catch (error) {
      console.error('Error al enviar imagen por WhatsApp Cloud API:', error);
      return false;
    }
  }

  public async sendKitchenAlert(message: string): Promise<boolean> {
    return this.sendMessage(this.config.kitchenPhoneNumber, message);
  }
}
