import { describe, expect, it } from 'vitest';
import { IntentRouterService } from '../src/application/services/IntentRouterService.js';

describe('menú: enrutamiento rápido sin depender de OpenAI', () => {
  it.each([
    'dame el menú',
    'muéstrame el menú',
    'quiero ver el menú',
    'pásame la carta',
    'quisiera conocer la carta',
    'me regalas el menú porfis',
    'me regalas la carta',
    'me mandas el menú en pdf',
    'quiero el menú',
    '¿qué hay en la carta?',
    'pdf del menú'
  ])('resuelve «%s» localmente', text => {
    const match = new IntentRouterService().routeIntent(text);
    expect(match?.intent).toBe('menu_request');
  });

  it.each([
    ['Quiero fresas con crema de 13 mil', '9 oz', '$13.000'],
    ['Quiero fresas con crema de $15.000', '10 oz', '$15.000'],
    ['Quiero fresas con crema de precio 18 mil', '12 oz', '$18.000'],
    ['Quiero fresas con crema de 20.000', '16 oz', '$20.000']
  ])('selecciona solo el tamaño que corresponde al precio: «%s»', (text, size, price) => {
    const match = new IntentRouterService().routeIntent(text);
    expect(match?.intent).toBe('product_selection');
    expect(match?.response).toContain(size);
    expect(match?.response).toContain(price);
    expect(match?.response).not.toContain('10 oz, 12 oz');
  });

  it.each(['¿Cuánto cuesta la oblea especial?', '¿Qué precio tiene la oblea?', 'cuánto vale el bowl de fresas'])('separa la consulta de precio de una intención de compra: «%s»', text => {
    const match = new IntentRouterService().routeIntent(text);
    expect(match?.intent).toBe('price_query');
    expect(match?.response).toContain('no he iniciado ningún pedido');
  });

  it.each(['¿Cuánto sería con el domi?', 'A cómo están las fresas?', 'Me pasas la cuenta', 'Mandame el número pa copiarlo'])('entiende expresiones coloquiales frecuentes sin inventar datos: «%s»', text => {
    const match = new IntentRouterService().routeIntent(text);
    expect(match).not.toBeNull();
    expect(match?.response.length).toBeLessThanOrEqual(320);
  });

  it('entrega directamente el número de Nequi', () => {
    const match = new IntentRouterService().routeIntent('Me pasas el número de Nequi');
    expect(match?.response).toBe('📱 Nequi: *3207407176*.');
  });

  it('indica que la cobertura es solo Pueblo Bello', () => {
    const match = new IntentRouterService().routeIntent('¿Dónde están ubicados?');
    expect(match?.response).toContain('Solo atendemos en Pueblo Bello');
  });

  it('rechaza domicilios fuera de cobertura sin pasar al modelo', () => {
    const match = new IntentRouterService().routeIntent('¿Hacen domicilio en Valledupar?');
    expect(match?.intent).toBe('delivery_options');
    expect(match?.response).toBe('🍓 Solo atendemos en Pueblo Bello, Cesar.');
  });

  it('no confunde un pedido de fresas con una consulta de cobertura', () => {
    const match = new IntentRouterService().routeIntent('hola mani, me regalas una fresa de 18 mil');
    expect(match?.intent).toBe('product_selection');
    expect(match?.response).toContain('12 oz');
    expect(match?.response).not.toContain('Solo atendemos');
  });

  it.each(['¿A cómo tienen el medio pollo?', 'Me traes una sopa de mondongo?', 'Una Coca Cola personal'])('rechaza productos ajenos al catálogo: «%s»', text => {
    const match = new IntentRouterService().routeIntent(text);
    expect(match?.intent).toBe('unsupported_product');
    expect(match?.response).toContain('fresas con crema');
  });

  it.each(['Fresas con crema', 'Fueron 2 obleas especiales'])('reconoce productos escritos como respuesta contextual: «%s»', text => {
    const match = new IntentRouterService().routeIntent(text);
    expect(match?.intent).toBe('product_selection');
    if (text.startsWith('Fueron')) {
      expect(match?.response).toContain('2x');
      expect(match?.response).toContain('Oblea especial');
    }
  });
});
