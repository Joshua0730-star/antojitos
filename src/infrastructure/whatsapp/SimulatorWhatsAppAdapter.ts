import { IWhatsAppService } from '../../application/ports/IWhatsAppService.js';

export class SimulatorWhatsAppAdapter implements IWhatsAppService {
  private kitchenAlerts: string[] = [];
  private outbox: Array<{ to: string; text?: string; imageUrl?: string }> = [];

  public async sendMessage(to: string, text: string): Promise<boolean> {
    this.outbox.push({ to, text });
    return true;
  }

  public async sendImage(to: string, imageUrl: string, caption?: string): Promise<boolean> {
    this.outbox.push({ to, imageUrl, text: caption });
    return true;
  }

  public async sendDocument(to: string, documentUrl: string, filename: string, caption?: string): Promise<boolean> {
    this.outbox.push({ to, imageUrl: documentUrl, text: `${filename}${caption ? ` — ${caption}` : ''}` });
    return true;
  }

  public async sendKitchenAlert(message: string): Promise<boolean> {
    this.kitchenAlerts.push(message);
    return true;
  }

  public getLatestKitchenAlert(): string | undefined {
    return this.kitchenAlerts[this.kitchenAlerts.length - 1];
  }

  public getAllKitchenAlerts(): string[] {
    return [...this.kitchenAlerts];
  }

  public getOutbox(): Array<{ to: string; text?: string; imageUrl?: string }> {
    return [...this.outbox];
  }

  public clear(): void {
    this.kitchenAlerts = [];
    this.outbox = [];
  }
}
