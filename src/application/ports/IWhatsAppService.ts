export interface IWhatsAppService {
  /**
   * Envía un mensaje de texto a un destinatario.
   */
  sendMessage(to: string, text: string): Promise<boolean>;

  /**
   * Envía una imagen con pie de foto opcional.
   */
  sendImage(to: string, imageUrl: string, caption?: string): Promise<boolean>;

  /**
   * Envía el mensaje con formato de nuevo pedido confirmado al grupo o contacto de cocina.
   */
  sendKitchenAlert(message: string): Promise<boolean>;
}
