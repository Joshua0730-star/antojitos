export const BUSINESS_MUNICIPALITY = 'Pueblo Bello';
export const BUSINESS_DEPARTMENT = 'Cesar';
export const BUSINESS_NEQUI_NUMBER = '3207407176';

export function normalizeBusinessText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

export function isSupportedMunicipality(value: string | undefined): boolean {
  if (!value?.trim()) return true;
  return normalizeBusinessText(value) === normalizeBusinessText(BUSINESS_MUNICIPALITY);
}
