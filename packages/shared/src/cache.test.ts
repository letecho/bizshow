import { describe, it, expect } from 'vitest';
import { appCache } from './cache';

describe('appCache (Phase1 in-memory fallback)', () => {
  it('stores and retrieves values in memory when REDIS_URL is unset', async () => {
    await appCache.set('test:key', 'hello-world', 60);
    const val = await appCache.get('test:key');
    expect(val).toBe('hello-world');
    expect(appCache.isDistributed()).toBe(false);
  });

  it('incr counts within the window and resets after it expires', async () => {
    const first = await appCache.incr('test:counter', 50);
    const second = await appCache.incr('test:counter', 50);
    expect(first.count).toBe(1);
    expect(second.count).toBe(2);
    expect(second.resetAt).toBe(first.resetAt);
    await new Promise((r) => setTimeout(r, 70));
    expect((await appCache.incr('test:counter', 50)).count).toBe(1);
  });

  it('del resets a counter', async () => {
    await appCache.incr('test:counter2', 60_000);
    await appCache.del('test:counter2');
    expect((await appCache.incr('test:counter2', 60_000)).count).toBe(1);
  });
});
