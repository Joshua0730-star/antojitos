import { describe, expect, it } from 'vitest';
import { IntentRouterService } from '../src/application/services/IntentRouterService.js';

describe('menú: enrutamiento rápido sin depender de OpenAI', () => {
  it.each([
    'dame el menú',
    'muéstrame el menú',
    'quiero ver el menú',
    'pásame la carta',
    'quisiera conocer la carta'
  ])('resuelve «%s» localmente', text => {
    const match = new IntentRouterService().routeIntent(text);
    expect(match?.intent).toBe('menu_request');
  });
});
