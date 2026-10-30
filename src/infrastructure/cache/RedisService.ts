import { Redis } from 'ioredis';
import { ENV } from '../config/env.js';

export interface ICacheService {
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<void>;
  pushToList(key: string, item: string, ttlSeconds?: number): Promise<void>;
  getList(key: string): Promise<string[]>;
  acquireLock(lockKey: string, ttlSeconds?: number): Promise<boolean>;
  releaseLock(lockKey: string): Promise<void>;
  isAvailable(): boolean;
  getStatus(): 'connected' | 'connecting' | 'fallback';
  close(): Promise<void>;
}

export class RedisService implements ICacheService {
  private client: Redis | null = null;
  private isConnected = false;
  private isConnecting = false;
  private memoryStore: Map<string, { value: any; expiresAt?: number }> = new Map();

  constructor() {
    this.initClient();
  }

  private initClient(): void {
    if (ENV.REDIS_URL || ENV.REDIS_HOST) {
      try {
        this.isConnecting = true;
        const options = {
          lazyConnect: true,
          connectTimeout: 5_000,
          enableReadyCheck: true,
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
          // Redis may restart; reconnect with a bounded backoff instead of
          // silently falling back forever after one transient failure.
          retryStrategy: (attempt: number) => Math.min(attempt * 250, 5_000)
        } as const;
        if (ENV.REDIS_URL) {
          this.client = new Redis(ENV.REDIS_URL, options);
        } else {
          this.client = new Redis({
            host: ENV.REDIS_HOST,
            port: ENV.REDIS_PORT,
            password: ENV.REDIS_PASSWORD,
            ...options
          });
        }

        this.client.connect().then(() => {
          this.isConnected = true;
          this.isConnecting = false;
          console.log('⚡ Conexión a Redis establecida con éxito.');
        }).catch((err) => {
          this.isConnected = false;
          this.isConnecting = false;
          console.warn('⚠️ Redis no disponible, utilizando fallback en memoria:', err.message);
        });

        this.client.on('error', (err) => {
          this.isConnected = false;
          this.isConnecting = false;
          console.warn('⚠️ Redis perdió la conexión; se usará fallback mientras reconecta:', err.message);
        });
        this.client.on('ready', () => {
          this.isConnected = true;
          this.isConnecting = false;
        });
        this.client.on('reconnecting', () => {
          this.isConnected = false;
          this.isConnecting = true;
        });
      } catch (err) {
        this.isConnected = false;
        this.isConnecting = false;
        console.warn('⚠️ Error inicializando Redis, usando fallback en memoria:', err);
      }
    } else {
      // Modo desarrollo local sin Redis configurado
      this.isConnected = false;
    }
  }

  public isAvailable(): boolean {
    return this.isConnected && this.client !== null;
  }

  public getStatus(): 'connected' | 'connecting' | 'fallback' {
    if (this.isAvailable()) return 'connected';
    return this.isConnecting ? 'connecting' : 'fallback';
  }

  public async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.isAvailable() && this.client) {
      try {
        if (ttlSeconds) {
          await this.client.set(key, value, 'EX', ttlSeconds);
        } else {
          await this.client.set(key, value);
        }
        return;
      } catch {
        // Fallback en caso de error
      }
    }

    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined;
    this.memoryStore.set(key, { value, expiresAt });
  }

  public async get(key: string): Promise<string | null> {
    if (this.isAvailable() && this.client) {
      try {
        return await this.client.get(key);
      } catch {
        // Fallback
      }
    }

    const item = this.memoryStore.get(key);
    if (!item) return null;
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.memoryStore.delete(key);
      return null;
    }
    return typeof item.value === 'string' ? item.value : JSON.stringify(item.value);
  }

  public async del(key: string): Promise<void> {
    if (this.isAvailable() && this.client) {
      try {
        await this.client.del(key);
      } catch {
        // Fallback
      }
    }
    this.memoryStore.delete(key);
  }

  public async pushToList(key: string, item: string, ttlSeconds: number = 300): Promise<void> {
    if (this.isAvailable() && this.client) {
      try {
        await this.client.rpush(key, item);
        await this.client.expire(key, ttlSeconds);
        return;
      } catch {
        // Fallback
      }
    }

    const existing = this.memoryStore.get(key);
    let list: string[] = [];
    if (existing && Array.isArray(existing.value)) {
      list = existing.value;
    }
    list.push(item);
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.memoryStore.set(key, { value: list, expiresAt });
  }

  public async getList(key: string): Promise<string[]> {
    if (this.isAvailable() && this.client) {
      try {
        return await this.client.lrange(key, 0, -1);
      } catch {
        // Fallback
      }
    }

    const item = this.memoryStore.get(key);
    if (!item) return [];
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.memoryStore.delete(key);
      return [];
    }
    return Array.isArray(item.value) ? item.value : [];
  }

  public async acquireLock(lockKey: string, ttlSeconds: number = 15): Promise<boolean> {
    const fullKey = `lock:${lockKey}`;
    if (this.isAvailable() && this.client) {
      try {
        const res = await this.client.set(fullKey, 'locked', 'EX', ttlSeconds, 'NX');
        return res === 'OK';
      } catch {
        // Fallback
      }
    }

    const now = Date.now();
    const existing = this.memoryStore.get(fullKey);
    if (existing && (!existing.expiresAt || existing.expiresAt > now)) {
      return false; // Ya bloqueado
    }

    this.memoryStore.set(fullKey, { value: 'locked', expiresAt: now + ttlSeconds * 1000 });
    return true;
  }

  public async releaseLock(lockKey: string): Promise<void> {
    const fullKey = `lock:${lockKey}`;
    await this.del(fullKey);
  }

  public async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {}
      this.client = null;
      this.isConnected = false;
    }
    this.memoryStore.clear();
  }
}
