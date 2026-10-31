import { describe, expect, it } from 'vitest';
import type { ICacheService } from '../src/infrastructure/cache/RedisService.js';
import { OperatingScheduleService } from '../src/application/services/OperatingScheduleService.js';

class MemoryCache implements ICacheService {
  private readonly values = new Map<string, string>();
  async set(key: string, value: string): Promise<void> { this.values.set(key, value); }
  async setIfAbsent(key: string, value: string): Promise<boolean> { if (this.values.has(key)) return false; this.values.set(key, value); return true; }
  async get(key: string): Promise<string | null> { return this.values.get(key) ?? null; }
  async del(key: string): Promise<void> { this.values.delete(key); }
  async pushToList(): Promise<void> {}
  async getList(): Promise<string[]> { return []; }
  async acquireLock(): Promise<boolean> { return true; }
  async releaseLock(): Promise<void> {}
  isAvailable(): boolean { return true; }
  getStatus(): 'connected' { return 'connected'; }
  async close(): Promise<void> {}
}

describe('horario operativo persistente', () => {
  it('persiste cierre y apertura del día entre instancias', async () => {
    const cache = new MemoryCache();
    const now = new Date('2026-11-03T20:00:00.000Z');
    const first = new OperatingScheduleService(cache);
    await first.handleOperatorCommand('!horario off', now);
    expect(await first.isOpenAsync(now)).toBe(false);

    const second = new OperatingScheduleService(cache);
    expect(await second.isOpenAsync(now)).toBe(false);
    await second.handleOperatorCommand('!horario on', now);
    expect(await first.isOpenAsync(now)).toBe(true);
  });
});
