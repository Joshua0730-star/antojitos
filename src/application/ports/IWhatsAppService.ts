export interface IWhatsAppService {
  /** Lista interactiva nativa de WhatsApp. Si el proveedor no la soporta,
   * el caso de uso debe conservar el texto numerado como respaldo. */
  sendInteractiveList?(to: string, list: WhatsAppInteractiveList): Promise<boolean>;
  /**
   * Envía un mensaje de texto a un destinatario.
   */
  sendMessage(to: string, text: string): Promise<boolean>;

  /**
   * Envía una imagen con pie de foto opcional.
   */
  sendImage(to: string, imageUrl: string, caption?: string): Promise<boolean>;

  /** Envía un documento alojado en una URL pública. */
  sendDocument?(to: string, documentUrl: string, filename: string, caption?: string): Promise<boolean>;

  /**
   * Envía el mensaje con formato de nuevo pedido confirmado al grupo o contacto de cocina.
   */
  sendKitchenAlert(message: string): Promise<boolean>;

  /**
   * Descarga los datos de un ID de multimedia de WhatsApp o retorna la URL directa.
   */
  getMediaDataUrl?(mediaIdOrUrl: string): Promise<string>;

  /**
   * Marca un mensaje como leído (doble check azul) en WhatsApp Cloud API.
   */
  markAsRead?(messageId: string, details?: { remoteJid: string; remoteJidAlt?: string; fromMe: boolean }): Promise<boolean>;
}

export interface WhatsAppInteractiveList {
  header?: string;
  body: string;
  footer?: string;
  button: string;
  sections: Array<{
    title?: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>;
}
