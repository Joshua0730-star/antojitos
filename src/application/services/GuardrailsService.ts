export interface GuardrailValidationResult {
  isValid: boolean;
  sanitizedText: string;
  flaggedReason?: string;
}

export class GuardrailsService {
  private injectionPatterns = [
    /ignore\s+(?:all\s+)?(?:previous\s+)?instructions/i,
    /system\s+prompt\s+override/i,
    /you\s+are\s+now\s+in\s+dan\s+mode/i,
    /reveal\s+(?:your\s+)?(?:system\s+prompt|instructions|keys|passwords)/i,
    /act\s+as\s+a\s+(?:linux\s+terminal|python\s+repl|unfiltered)/i,
    /dime\s+tus\s+instrucciones\s+del\s+sistema/i,
    /ignora\s+(?:todas\s+)?las\s+instrucciones\s+anteriores/i
  ];

  /**
   * Valida y sanitiza el mensaje entrante del usuario protegiendo contra Prompt Injection.
   */
  public validateInput(text: string): GuardrailValidationResult {
    const trimmed = text.trim();

    for (const pattern of this.injectionPatterns) {
      if (pattern.test(trimmed)) {
        return {
          isValid: false,
          sanitizedText: '',
          flaggedReason: 'Posible intento de manipulación o inyección de prompt detectado.'
        };
      }
    }

    return {
      isValid: true,
      sanitizedText: trimmed
    };
  }

  /**
   * Valida que la respuesta generada por el LLM no contenga fugas de información ni texto inapropiado.
   */
  public validateOutput(text: string): GuardrailValidationResult {
    const trimmed = text.trim();

    // Comprobar fugas de API Keys o credenciales
    if (/AIzaSy|sk-[a-zA-Z0-9]{32,}|Bearer\s+EAAG/i.test(trimmed)) {
      return {
        isValid: false,
        sanitizedText: '¡Hola! 🍓 Con gusto te ayudamos con tu pedido. ¿Qué producto deseas ordenar?',
        flaggedReason: 'Fuga de credenciales o tokens detectada en la salida del LLM.'
      };
    }

    return {
      isValid: true,
      sanitizedText: trimmed
    };
  }

  /**
   * Respuesta de fallback segura en caso de caída temporal del proveedor de IA.
   */
  public getFallbackResponse(): string {
    return '¡Hola! 🍓 En este momento tenemos una alta demanda en nuestros servidores. Por favor déjanos tu pedido detallado (producto, cantidad, dirección y método de pago) y un asesor te confirmará de inmediato.';
  }
}
