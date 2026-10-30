import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Redis from 'ioredis';

const redisUrl = process.env.REDIS_TEST_URL;
const suite = redisUrl ? describe : describe.skip;

suite('Redis real: atomicidad y locks distribuidos', () => {
  let redis: Redis;
  const prefix = `antojitos:test:${process.pid}:${Date.now()}`;

  beforeAll(async () => {
    redis = new Redis(redisUrl!, { maxRetriesPerRequest: 1 });
    await redis.ping();
  });

  afterAll(async () => {
    if (redis) {
      const keys = await redis.keys(`${prefix}:*`);
      if (keys.length) await redis.del(...keys);
      await redis.quit();
    }
  });

  it('permite una sola escritura concurrente con SET NX', async () => {
    const key = `${prefix}:idempotency`;
    const results = await Promise.all(Array.from({ length: 50 }, () =>
      redis.set(key, '1', 'EX', 60, 'NX')
    ));
    expect(results.filter(value => value === 'OK')).toHaveLength(1);
  });

  it('adquiere y libera un lock distribuido', async () => {
    const key = `${prefix}:lock`;
    expect(await redis.set(key, 'owner-a', 'EX', 60, 'NX')).toBe('OK');
    expect(await redis.set(key, 'owner-b', 'EX', 60, 'NX')).toBeNull();
    expect(await redis.del(key)).toBe(1);
    expect(await redis.set(key, 'owner-b', 'EX', 60, 'NX')).toBe('OK');
  });
});
