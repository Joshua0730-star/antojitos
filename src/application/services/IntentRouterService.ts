import { BUSINESS_DEPARTMENT, BUSINESS_MUNICIPALITY, BUSINESS_NEQUI_NUMBER } from '../config/businessFacts.js';

export interface IntentMatch {
  intent: 'greeting' | 'menu_request' | 'price_query' | 'start_order' | 'order_status' | 'business_hours' | 'payment_methods' | 'location' | 'delivery_options' | 'product_customization' | 'product_selection' | 'unsupported_product';
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
    /^(?:dame|p[aá]same|env[ií]ame|mu[eé]strame|muestra)\s+(?:el\s+)?men[uú]$/i,
    /^(?:quiero|quisiera|puedo)\s+(?:ver|conocer|consultar)\s+(?:el\s+)?men[uú]$/i,
    /^(?:dame|p[aá]same|mu[eé]strame|muestra|reg[aá]lame|me\s+regalas)\s+(?:la\s+)?carta$/i,
    /^(?:me\s+)?(?:regalas|regalas|env[ií]as|compartes|mandas|pasas)\s+(?:el\s+)?men[uú](?:\s+(?:en\s+pdf|porfis|porfa|por\s+favor))?$/i,
    /^(?:quiero|quisiera)\s+(?:(?:ver|conocer)\s+)?(?:la\s+)?carta$/i,
    /^carta$/i,
    /^qu[eé]\s+venden\??$/i,
    /^precios$/i,
    /^lista\s+de\s+precios$/i,
    /^cat[aá]logo$/i
  ];

  private priceQuestionPattern = /(?:cu[aá]nto|cu[aá]l)s+(?:cuesta|vale|ess+els+precio|ess+sus+valor)|(?:precio|valor)s+(?:de|del|por)|as+c[oó]mos+est[aá]/i;

  private startOrderKeywords = [/^2$/i, /^hacer\s+pedido$/i, /^hacer\s+un\s+pedido$/i, /^pedir$/i, /^ordenar$/i];
  private statusKeywords = [/^3$/i, /estado\s+(?:de\s+)?(?:mi\s+)?pedido/i, /seguimiento/i, /d[oó]nde\s+va\s+mi\s+pedido/i];

  private hoursKeywords = [
    /horario/i,
    /a\s+qu[eé]\s+hora\s+(?:abren|cierran)/i,
    /est[aá]n\s+abiertos/i,
    /\b(?:trabajan|trabajando|atienden|servicio)\b/i,
    /\bhoy\s+(?:abren|trabajan|atienden)/i
  ];

  private unsupportedProductKeywords = [
    /\bpollo\b/i,
    /\b(?:sopa|sopas)\b/i,
    /\bmondongo\b/i,
    /\bcaldo\b/i,
    /\bbroaster\b/i,
    /\basado\b/i,
    /\bcoca\s*cola\b/i,
    /\bgaseosa\b/i
  ];

  private outOfCoverageKeywords = [
    /\b(?:valledupar|aguachica|bosconia|codazzi|la paz|manaure|becerril|curuman[ií]|chiriguan[aá])\b/i,
    /\botro\s+municipio\b/i,
    /\bfuera\s+de\s+pueblo\s+bello\b/i
  ];

  private locationKeywords = [
    /d[oó]nde\s+est[aá]n\s+(?:ubicados|el\s+local)/i,
    /direcci[oó]n\s+del\s+local/i,
    /d[oó]nde\s+queda/i,
    /ubicaci[oó]n/i
  ];

  private paymentKeywords = [
    /m[eé]todos?\s+de\s+pago/i,
    /c[oó]mo\s+puedo\s+pagar/i,
    /reciben\s+nequi/i,
    /reciben\s+tarjeta/i,
    /reciben\s+efectivo/i,
    /(?:me\s+)?pasas?\s+(?:(?:el|la)\s+)?(?:n[uú]mero|cuenta)/i,
    /manda(?:me)?\s+(?:(?:el|la)\s+)?(?:n[uú]mero|cuenta)/i,
    /(?:n[uú]mero|cuenta)\s+(?:de\s+)?(?:nequi|transferencia)/i,
    /\btransfer(?:encia|ir)\b/i,
    /\bconsign(?:ar|o|aci[oó]n)\b/i,
    /\bpagar(?:[eé]|[ií]a)?\s+(?:por\s+)?(?:nequi|transferencia|efectivo)/i
  ];

  private deliveryKeywords = [
    /a\s+domicilio/i,
    /recoger(?:lo)?\s+(?:en|al)\s+(?:el\s+)?local/i,
    /paso\s+a\s+recoger/i,
    /punto\s+f[ií]sico/i,
    /\bdomi\b/i,
    /para\s+(?:enviar|mandar|llevar)/i,
    /a\s+mi\s+casa/i
  ];

  private customizationPattern = /fresas?\s+con\s+crema.*(?:\d+\s*onzas?|\d+\s*oz|toppings?|salsas?)/i;

  private sauces = ['mora', 'fresa', 'arequipe', 'leche condensada', 'chocolate'];
  private toppings = ['brownie', 'chocorramo', 'masmelo', 'biscolata', 'chokis', 'quipito', 'ducales', 'minichip', 'zukarita', 'oreo', 'leche en polvo', 'flips', 'queso'];

  private normalize(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  private menuResponse(): string {
    return '🍓 Te comparto el menú completo en PDF. Dime qué producto deseas y te ayudo a elegir solo las opciones que falten.';
  }

  private findCustomizationOption(text: string, options: string[]): string | undefined {
    const normalized = this.normalize(text);
    return options.find(option => {
      const escaped = option.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|\\s)${escaped}(?=$|\\s|[,.!?])`).test(normalized);
    });
  }

  private customizationResponse(text: string): string {
    const optionText = this.normalize(text)
      .replace(/\bfresas?\s+con\s+crema\b/g, '')
      .replace(/\b(?:una|un|dos|tres|quiero|regalame|dame)\s+fresas?\b/g, '')
      .replace(/\bfresa\s+de\s+\$?\d/g, '');
    const sauce = this.findCustomizationOption(optionText, this.sauces);
    const topping = this.findCustomizationOption(optionText, this.toppings);
    if (sauce && topping) return `✅ Salsa: *${sauce}*. Topping: *${topping}*. ¿Cómo lo entregamos?\n1) Domicilio\n2) Recoger`;
    if (sauce) return `✅ Salsa: *${sauce}*. Elige 1 topping:\n1) Brownie  2) Chocorramo  3) Oreo  4) Queso  5) Minichip`;
    if (topping) return `✅ Topping: *${topping}*. Elige 1 salsa:\n1) Mora  2) Fresa  3) Arequipe  4) Leche condensada  5) Chocolate`;
    return 'Elige 1 salsa:\n1) Mora  2) Fresa  3) Arequipe  4) Leche condensada  5) Chocolate';
  }

  private productSelection(text: string): IntentMatch | null {
    const normalized = this.normalize(text);
    const containsKnownProduct = /\b(?:fresas?\s+con\s+crema|fresa(?:s)?|oblea(?:s)?|ensalada(?:s)?\s+de\s+frutas?|sandwich(?:es)?)\b/i.test(normalized);
    const contextualConfirmation = /\b(?:fueron|serian|serían|son|ser[aá])\b/i.test(normalized);
    if (!/(quiero|deseo|pedir|ordenar|me das|regalame|dame|una?|un)\b/i.test(normalized) && !(containsKnownProduct && (contextualConfirmation || normalized === 'fresas con crema' || normalized === 'oblea' || normalized === 'obleas'))) return null;

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
    const selected = products.find(product => normalized.includes(product.phrase)) ||
      (/\bfresa\b/.test(normalized) && this.strawberryVariant(text)
        ? { phrase: 'fresa', label: 'Fresas con crema', price: 'desde $13.000' }
        : undefined);
    if (selected) {
      if (selected.label === 'Fresas con crema') {
        const variant = this.strawberryVariant(text);
        if (variant) {
          return {
            intent: 'product_selection',
            response: `✅ *Fresas con crema ${variant.size}* — ${variant.price}. ${this.customizationResponse(text)}`,
            confidence: 0.99
          };
        }
      }
      const extra = selected.label === 'Fresas con crema'
        ? ' Elige tamaño:\n1) 9 oz (Personal) — $13.000\n2) 10 oz — $15.000\n3) 12 oz — $18.000\n4) 16 oz — $20.000\nDespués elegimos salsa y toppings.'
        : selected.label.includes('Oblea') || selected.label.includes('Cuchareable')
          ? ' Confírmame la cantidad.'
          : ' Te indicaré las opciones que falten antes de confirmar.';
      return {
        intent: 'product_selection',
        response: `✅ Entendido: deseas *${selected.label}* (${selected.price}). No lo voy a sustituir por otro producto.${extra}`,
        confidence: 0.99
      };
    }

    if (/\boblea/.test(normalized) && /\bespecial(?:es)?\b/.test(normalized)) {
      const quantityMatch = normalized.match(/\b(\d{1,2})\s+obleas?\b/);
      const quantity = quantityMatch ? Number(quantityMatch[1]) : 1;
      const quantityLabel = quantity > 1 ? `${quantity}x ` : '';
      return {
        intent: 'product_selection',
        response: `✅ Anoté ${quantityLabel}*Oblea especial* ($12.000 cada una). ¿Cómo lo entregamos?\n1) Domicilio\n2) Recoger`,
        confidence: 0.99
      };
    }

    if (/\boblea(s)?\b/i.test(normalized)) {
      return {
        intent: 'product_selection',
        response: '✅ Elige una oblea:\n1) Sencilla — $5.000\n2) Mini especial — $8.000\n3) Especial — $12.000\n4) Cuchareable — $20.000',
        confidence: 0.99
      };
    }
    return null;
  }

  private strawberryVariant(text: string): { size: string; price: string } | null {
    const normalized = this.normalize(text);
    const variants = [
      { size: '9 oz', price: '$13.000', sizePattern: /\b9\s*(?:oz|onzas?)\b/, pricePattern: /(?:precio|valor|de|por)?\s*\$?\s*(?:13(?:[.,]0{3}|000)|13\s*mil)\b/ },
      { size: '10 oz', price: '$15.000', sizePattern: /\b10\s*(?:oz|onzas?)\b/, pricePattern: /(?:precio|valor|de|por)?\s*\$?\s*(?:15(?:[.,]0{3}|000)|15\s*mil)\b/ },
      { size: '12 oz', price: '$18.000', sizePattern: /\b12\s*(?:oz|onzas?)\b/, pricePattern: /(?:precio|valor|de|por)?\s*\$?\s*(?:18(?:[.,]0{3}|000)|18\s*mil)\b/ },
      { size: '16 oz', price: '$20.000', sizePattern: /\b16\s*(?:oz|onzas?)\b/, pricePattern: /(?:precio|valor|de|por)?\s*\$?\s*(?:20(?:[.,]0{3}|000)|20\s*mil)\b/ }
    ];
    return variants.find(variant => variant.sizePattern.test(normalized) || variant.pricePattern.test(normalized)) || null;
  }

  private priceQuery(text: string): IntentMatch | null {
    const normalized = this.normalize(text);
    if (!/(?:cuanto|cual)\s+(?:cuesta|vale|es\s+el\s+precio|es\s+su\s+valor|seria)|que\s+precio\s+tiene|(?:precio|valor)\s+(?:de|del|por)\b|a\s+como\s+(?:esta|estan)|cuanto\s+seria/i.test(normalized)) return null;

    const prices = [
      { phrases: ['cuchareable de obleas', 'cuchareable'], label: 'Cuchareable de obleas', price: '$20.000' },
      { phrases: ['oblea mini especial', 'mini especial'], label: 'Oblea mini especial', price: '$8.000' },
      { phrases: ['oblea especial'], label: 'Oblea especial', price: '$12.000' },
      { phrases: ['oblea sencilla'], label: 'Oblea sencilla', price: '$5.000' },
      { phrases: ['bowl de fresas'], label: 'Bowl de fresas con crema', price: '$25.000' },
      { phrases: ['fresas con crema', 'fresas'], label: 'Fresas con crema', price: 'desde $13.000 según tamaño' },
      { phrases: ['bandeja enamorate', 'bandeja enamórate'], label: 'Bandeja Enamórate', price: '$30.000' },
      { phrases: ['bowl enamorate', 'bowl enamórate'], label: 'Bowl Enamórate', price: '$26.000' },
      { phrases: ['ensalada de frutas', 'ensalada'], label: 'Ensalada de frutas', price: 'desde $16.000 según presentación' },
      { phrases: ['sandwich especial', 'sándwich especial'], label: 'Sándwich especial', price: '$8.000' },
      { phrases: ['sandwich sencillo', 'sándwich sencillo'], label: 'Sándwich sencillo', price: '$6.000' },
      { phrases: ['oblea'], label: 'Obleas', price: 'sencilla $5.000 · mini especial $8.000 · especial $12.000 · cuchareable $20.000' }
    ];
    const product = prices.find(candidate => candidate.phrases.some(phrase => normalized.includes(this.normalize(phrase))));
    if (!product) {
      return {
        intent: 'price_query',
        response: 'Con gusto te indico el precio. ¿De cuál producto y presentación deseas consultar el valor? No iniciaré un pedido solo por esta pregunta. 🍓',
        confidence: 0.92
      };
    }

    return {
      intent: 'price_query',
      response: `💰 El precio de *${product.label}* es ${product.price}. Esta es solo una consulta; no he iniciado ningún pedido. Si deseas comprarlo, dime la presentación y te ayudo a armarlo. 🍓`,
      confidence: 0.99
    };
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
        response: this.menuResponse(),
        confidence: 0.99
      };
    }
    for (const pattern of this.menuKeywords) {
      if (pattern.test(trimmed)) {
        return {
          intent: 'menu_request',
          response: this.menuResponse(),
          confidence: 0.95
        };
      }
    }

    // Las solicitudes informales de menú también deben activar siempre el
    // documento. Si no entran aquí, el mensaje cae al LLM y puede responder
    // con una lista incompleta o no enviar el PDF.
    const normalizedMenuRequest = this.normalize(trimmed);
    if (/\b(menu|carta)\b/.test(normalizedMenuRequest) &&
      /\b(dame|muestra|ver|quiero|quisiera|regala|manda|envia|pasame|compart|pdf|que hay|cuales|precios?)\b/.test(normalizedMenuRequest)) {
      return {
        intent: 'menu_request',
        response: this.menuResponse(),
        confidence: 0.96
      };
    }

    // Evita que el modelo improvise productos ajenos al catálogo. Estos
    // términos aparecen en el historial real cuando el cliente escribe al
    // número equivocado o mezcla conversaciones con otro negocio.
    if (this.unsupportedProductKeywords.some(pattern => pattern.test(trimmed))) {
      return {
        intent: 'unsupported_product',
        response: '🍓 En Antojitos ofrecemos fresas con crema, obleas, ensaladas de frutas y sándwiches. ¿Cuál de estos deseas pedir?',
        confidence: 0.99
      };
    }

    if (this.outOfCoverageKeywords.some(pattern => pattern.test(trimmed))) {
      return {
        intent: 'delivery_options',
        response: '🍓 Solo atendemos en Pueblo Bello, Cesar.',
        confidence: 0.99
      };
    }

    const priceMatch = this.priceQuery(trimmed);
    if (priceMatch) return priceMatch;

    for (const pattern of this.startOrderKeywords) {
      if (pattern.test(trimmed)) {
        return {
          intent: 'start_order',
          response: '📝 Elige tu producto:\n1) Fresas con crema\n2) Oblea\n3) Ensalada de frutas\n4) Sándwich',
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
          this.customizationResponse(trimmed),
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
          response: `📍 Solo atendemos en ${BUSINESS_MUNICIPALITY}, ${BUSINESS_DEPARTMENT}. ¿Deseas recoger o pedir a domicilio?`,
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
          response: /nequi|n[uú]mero|cuenta|transfer/i.test(trimmed)
            ? `📱 Nequi: *${BUSINESS_NEQUI_NUMBER}*.`
            : '💳 Elige cómo pagar:\n1) Nequi\n2) Efectivo contra entrega',
          confidence: 0.95
        };
      }
    }

    return null;
  }
}
