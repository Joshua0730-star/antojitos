import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloudApiWhatsAppAdapter } from '../src/infrastructure/whatsapp/CloudApiWhatsAppAdapter.js';

describe('WhatsApp username/BSUID identity handling', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('preserves a BSUID in Cloud API outbound messages instead of converting it to digits', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new CloudApiWhatsAppAdapter({
      phoneNumberId: 'phone-id',
      accessToken: 'token',
      kitchenPhoneNumber: '573000000000'
    });

    await adapter.sendMessage('CO.123456789012345', 'Hola');

    const request = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(request.to).toBeUndefined();
    expect(request.recipient).toBe('CO.123456789012345');
  });

  it('keeps legacy phone-number delivery unchanged', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new CloudApiWhatsAppAdapter({
      phoneNumberId: 'phone-id',
      accessToken: 'token',
      kitchenPhoneNumber: '573000000000'
    });

    await adapter.sendMessage('+57 300 111 2233', 'Hola');

    const request = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(request.to).toBe('573001112233');
    expect(request.recipient).toBeUndefined();
  });
});
