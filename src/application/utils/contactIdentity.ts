/**
 * Identidad estable para una conversación de WhatsApp.
 *
 * WhatsApp/Evolution puede entregar el teléfono, un JID o un LID cuando el
 * número no está disponible. Nunca debemos normalizar un LID/usuario a una
 * cadena vacía: es el único identificador que permite continuar la
 * conversación y responder al contacto.
 */
export function normalizeContactIdentity(value: string): string {
  const identity = String(value || '').trim();
  if (!identity) throw new Error('Identificador de contacto vacío');

  // A phone JID and its plain phone number are the same conversation. Keep
  // non-phone LIDs intact, but canonicalize numeric JIDs so an operator pause
  // cannot be bypassed by a provider changing the identifier format.
  if (identity.includes('@')) {
    const [localPart, server] = identity.split('@', 2);
    const jidDigits = localPart.replace(/\D/g, '');
    if (jidDigits.length >= 7 && server?.toLowerCase().includes('whatsapp')) return jidDigits;
    return identity;
  }

  const digits = identity.replace(/\D/g, '');
  if (digits.length >= 7) return digits;

  // Algunos proveedores entregan el username sin sufijo. Conservamos solo
  // caracteres seguros para usarlo como clave de conversación y reenviarlo
  // a Evolution sin convertirlo en "".
  if (/^[A-Za-z0-9._:-]{2,128}$/.test(identity)) return identity;

  throw new Error('Identificador de contacto inválido');
}
