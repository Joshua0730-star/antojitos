export interface IntentMatch {
  intent: 'greeting' | 'menu_request' | 'start_order' | 'order_status' | 'business_hours' | 'payment_methods' | 'location' | 'delivery_options' | 'product_customization' | 'product_selection';
  response: string;
  confidence: number;
}

export class IntentRouterService {
  private greetings = [
    /^hola+$/i,
    /^hola\s+buenas(?:\s+tardes|\s+dias|\s+noches)?$/i,
    /^buen(?:as|os)\s+(?:dias|tardes|noches)$/i,
    /^buenas$/i,
    /^hey$/i,
    /^hi$/i
  ];

  private menuKeywords = [
    /^ver\s+men[uú]$/i,
    /^men[uú]$/i,
    /^carta$/i,
    /^qu[eé]\s+venden\??$/i,
    /^precios$/i,
    /^lista\s+de\s+precios$/i,
    /^cat[aá]logo$/i
  ];

  private startOrderKeywords = [/^2$/i, /^hacer\s+pedido$/i, /^hacer\s+un\s+pedido$/i, /^pedir$/i, /^ordenar$/i];
  private statusKeywords = [/^3$/i, /estado\s+(?:de\s+)?(?:mi\s+)?pedido/i, /seguimiento/i, /d[oó]nde\s+va\s+mi\s+pedido/i];

  private hoursKeywords = [
    /horario/i,
    /a\s+qu[eé]\s+hora\s+(?:abren|cierran)/i,
    /est[aá]n\s+abiertos/i
  ];

  private locationKeywords = [
    /d[oó]nde\s+est[aá]n\s+(?:ubicados|el\s+local)/i,
    /direcci[oó]n\s+del\s+local/i,
    /d[oó]nde\s+queda/i
  ];

  private paymentKeywords = [
    /m[eé]todos?\s+de\s+pago/i,
    /c[oó]mo\s+puedo\s+pagar/i,
    /reciben\s+nequi/i,
    /reciben\s+tarjeta/i,
    /reciben\s+efectivo/i
  ];

  private deliveryKeywords = [
    /a\s+domicilio/i,
    /recoger(?:lo)?\s+(?:en|al)\s+(?:el\s+)?local/i,
    /paso\s+a\s+recoger/i,
    /punto\s+f[ií]sico/i
  ];

  private customizationPattern = /fresas?\s+con\s+crema.*(?:\d+\s*onzas?|\d+\s*oz|toppings?|salsas?)/i;

  private normalize(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  private productSelection(text: string): IntentMatch | null {
    const normalized = this.normalize(text);
    if (!/(quiero|deseo|pedir|ordenar|me das|regalame|dame|una?|un)\b/i.test(normalized)) return null;

    // Match the most specific product first. Never infer a strawberry product
    // from the generic word "oblea" or vice versa.
    const products = [
      { phrase: 'cuchareable de obleas', label: 'Cuchareable de obleas', price: '$20.000' },
      { phrase: 'oblea mini especial', label: 'Oblea mini especial', price: '$8.000' },
      { phrase: 'oblea especial', label: 'Oblea especial', price: '$12.000' },
      { phrase: 'oblea sencilla', label: 'Oblea sencilla', price: '$5.000' },
      { phrase: 'bowl de fresas con crema', label: 'Bowl de fresas con crema x 2', price: '$25.000' },
      { phrase: 'fresas con crema', label: 'Fresas con crema', price: 'desde $13.000' },
      { phrase: 'bandeja enamorate', label: 'Bandeja Enamórate', price: '$30.000' },
      { phrase: 'bowl enamorate', label: 'Bowl Enamórate', price: '$26.000' },
      { phrase: 'ensalada de frutas', label: 'Ensalada de frutas', price: 'desde $16.000' },
      { phrase: 'sandwich especial', label: 'Sándwich especial con verduras', price: '$8.000' },
      { phrase: 'sandwich sencillo', label: 'Sándwich sencillo', price: '$6.000' }
    ];
    const selected = products.find(product => normalized.includes(product.phrase));
    if (selected) {
      const extra = selected.label === 'Fresas con crema'
        ? ' Indícame el tamaño (Personal de 9 oz, 10 oz, 12 oz o 16 oz), la salsa y los toppings.'
        : selected.label.includes('Oblea') || selected.label.includes('Cuchareable')
          ? ' Confírmame la cantidad.'
          : ' Te indicaré las opciones que falten antes de confirmar.';
      return {
        intent: 'product_selection',
        response: `✅ Entendido: deseas *${selected.label}* (${selected.price}). No lo voy a sustituir por otro producto.${extra}`,
        confidence: 0.99
      };
    }

    if (/\boblea(s)?\b/i.test(normalized)) {
      return {
        intent: 'product_selection',
        response: '✅ Entendido: deseas una *oblea*. Tenemos sencilla ($5.000), mini especial ($8.000), especial ($12.000) y cuchareable ($20.000). ¿Cuál deseas? No la cambiaré por otro producto.',
        confidence: 0.99
      };
    }
    return null;
  }

  /**
   * Intenta clasificar la intención del usuario de forma ultrarrápida (<5ms)
   * para devolver respuestas cacheadas/plantillas sin consumir tokens ni latencia del LLM.
   */
  public routeIntent(text: string, isFirstMessage: boolean = false): IntentMatch | null {
    const trimmed = text.trim();
    if (!trimmed) return null;

    // 1. Saludos iniciales
    for (const pattern of this.greetings) {
      if (pattern.test(trimmed)) {
        return {
          intent: 'greeting',
          response:
            '¡Hola! 🍓 Bienvenido a *Antojitos*, donde los antojos se hacen realidad.\n\n' +
            '¿En qué te podemos consentir hoy?\n' +
            '1️⃣ *Ver el Menú Completo*\n' +
            '2️⃣ *Hacer un Pedido*\n' +
            '3️⃣ *Consultar Estado de mi Pedido*\n\n' +
            'Escríbenos lo que deseas ordenar o cuéntanos si tienes alguna duda.',
          confidence: 0.98
        };
      }
    }

    // 2. Consulta rápida de menú
    if (/^1$/i.test(trimmed)) {
      return {
        intent: 'menu_request',
        response: '🍓 Claro. Te muestro el menú completo:\n\n' +
          '• Fresas con crema: 9 oz $13.000 · 10 oz $15.000 · 12 oz $18.000 · 16 oz $20.000.\n' +
          '• Bowl de fresas: $25.000.\n' +
          '• Bandeja Enamórate: $30.000 · Bowl Enamórate: $26.000.\n' +
          '• Ensaladas: $16.000 · $20.000 · $26.000.\n' +
          '• Obleas: sencilla $5.000 · mini especial $8.000 · especial $12.000 · cuchareable $20.000.\n' +
          '• Sándwiches: sencillo $6.000 · especial $8.000.\n\n' +
          'Para iniciar, escribe el producto y las opciones que deseas. 🍓',
        confidence: 0.99
      };
    }
    for (const pattern of this.menuKeywords) {
      if (pattern.test(trimmed)) {
        return {
          intent: 'menu_request',
          response:
            '🍓 *NUESTRO MENÚ DE ANTOJITOS* 🍓\n\n' +
            '🍓 *Fresas con Crema:* 9 oz $13.000 · 10 oz $15.000 · 12 oz $18.000 · 16 oz $20.000\n' +
            '• Bowl de fresas $25.000 (1 salsa + 1 topping)\n\n' +
            '✨ *Bowls:* Bandeja Enamórate $30.000 · Bowl Enamórate $26.000\n' +
            '🥗 *Ensaladas:* Sencilla $16.000 · Mini especial $20.000 · Especial $26.000\n' +
            '🧇 *Obleas:* Sencilla $5.000 · Mini especial $8.000 · Especial $12.000 · Cuchareable $20.000\n' +
            '🥪 *Sándwiches:* Sencillo $6.000 · Especial $8.000\n\n' +
            'Escribe el producto, tamaño y las opciones que deseas para armar tu pedido. 🍓',
          confidence: 0.95
        };
      }
    }

    for (const pattern of this.startOrderKeywords) {
      if (pattern.test(trimmed)) {
        return {
          intent: 'start_order',
          response: '📝 ¡Perfecto! Empecemos tu pedido.\n\nDime qué producto deseas, el tamaño/cantidad y las opciones (por ejemplo, salsa, topping o frutas). Yo te indicaré solo lo que falte. 🍓',
          confidence: 0.98
        };
      }
    }

    for (const pattern of this.statusKeywords) {
      if (pattern.test(trimmed)) {
        return {
          intent: 'order_status',
          response: '🔎 Para consultar tu pedido, envíame el número de pedido o el número de teléfono usado en la compra. No compartas claves, códigos ni datos bancarios.',
          confidence: 0.97
        };
      }
    }

    // 3. Horarios
    if (this.customizationPattern.test(trimmed)) {
      return {
        intent: 'product_customization',
        response:
          '🍓 Perfecto. Anoté tus fresas con crema. Para personalizarlas, elige:\n' +
          '• *1 salsa:* Mora, leche condensada, fresa, arequipe o chocolate.\n' +
          '• *1 topping incluido:* Brownie, Chocorramo, masmelo, Biscolata, Chokis, Quipito, Ducales, Minichip, Zukarita, Oreo, leche en polvo, Flips o queso.\n' +
          '• Topping adicional de chocolate negro o blanco: $2.000.\n\n' +
          '¿Qué salsa y qué topping deseas?',
        confidence: 0.99
      };
    }

    const selectedProduct = this.productSelection(trimmed);
    if (selectedProduct) return selectedProduct;

    // 3. Horarios
    for (const pattern of this.hoursKeywords) {
      if (pattern.test(trimmed)) {
        return {
          intent: 'business_hours',
          response:
            '⏰ *Horario de Atención Antojitos:*\n' +
            '• Lunes a Sábado: 1:00 PM a 9:00 PM\n' +
            '• Domingos y Festivos: 2:00 PM a 8:30 PM\n\n' +
            '¡Estamos listos para tomar tu pedido! 🍓',
          confidence: 0.95
        };
      }
    }

    // 4. Ubicación
    for (const pattern of this.locationKeywords) {
      if (pattern.test(trimmed)) {
        return {
          intent: 'location',
          response:
            '📍 *Punto Físico y Domicilios:*\n' +
            'Para darte la dirección exacta del punto físico, confirma primero la ciudad o municipio.\n\n' +
            '¿Deseas pedir a domicilio o recoger en el punto físico?',
          confidence: 0.95
        };
      }
    }

    // La modalidad de entrega nunca se responde como plantilla aquí: depende
    // del pedido acumulado (total, dirección, barrio y tarifa variable). Se
    // deja al flujo contextual de IA para no repetir la misma pregunta.

    // 5. Métodos de pago
    for (const pattern of this.paymentKeywords) {
      if (pattern.test(trimmed)) {
        return {
          intent: 'payment_methods',
          response:
            '💳 *Métodos de Pago Disponibles:*\n' +
            '1. *Nequi / Daviplata / QR Bancolombia* (Envías el pantallazo del comprobante por aquí)\n' +
            '2. *Efectivo contra entrega* (Nos indicas con cuánto billete pagas para llevar tu cambio exacto)\n\n' +
            'Escribe el producto que deseas y te ayudo a armarlo. 🍓',
          confidence: 0.95
        };
      }
    }

    return null;
  }
}
