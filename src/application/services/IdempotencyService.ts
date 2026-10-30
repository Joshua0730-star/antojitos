import { ICacheService } from '../../infrastructure/cache/RedisService.js';

export class IdempotencyService {
  constructor(private readonly cacheService: ICacheService) {}

  /**
   * Verifica si un mensaje ya ha sido procesado previamente.
   * Si es nuevo, lo registra y retorna true (puede procesarse).
   * Si ya existe, retorna false (duplicado, debe ignorarse).
   */
  public async markIfNew(messageId?: string, ttlSeconds: number = 86400): Promise<boolean> {
    if (!messageId) {
      return true; // Sin ID explícito, permitir procesar
    }

    const key = `idempotency:msg:${messageId}`;
    const exists = await this.cacheService.get(key);

    if (exists) {
      return false; // Ya fue procesado
    }

    await this.cacheService.set(key, '1', ttlSeconds);
    return true; // Es nuevo
  }
}
