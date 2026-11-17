import { describe, it, expect } from 'vitest';
import { appCache } from './cache';

describe('appCache (Phase1 in-memory fallback)', () => {
  it('stores and retrieves values in memory when REDIS_URL is unset', async () => {
    await appCache.set('test:key', 'hello-world', 60);
    const val = await appCache.get('test:key');
    expect(val).toBe('hello-world');
    expect(appCache.isDistributed()).toBe(false);
  });
});
