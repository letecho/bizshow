import { LRUCache } from 'lru-cache';
import Redis from 'ioredis';

/**
 * 将来拡張スイッチ(SW-01)対応キャッシュラッパー:
 * - Phase1 (REDIS_URL未設定): プロセス内LRUメモリキャッシュで動作 (追加コスト ¥0)
 * - 成長後 (enable_valkey=true で REDIS_URL 設定時): コード変更なしでElastiCache Valkeyへ自動切替
 */
const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null;
const memoryCache = new LRUCache<string, string>({
  max: 500,
  ttl: 1000 * 60 * 5,
});

export const appCache = {
  isDistributed(): boolean {
    return Boolean(redis);
  },

  async get(key: string): Promise<string | null> {
    if (redis) {
      return await redis.get(key);
    }
    return memoryCache.get(key) ?? null;
  },

  async set(key: string, value: string, ttlSec = 300): Promise<void> {
    if (redis) {
      await redis.set(key, value, 'EX', ttlSec);
      return;
    }
    memoryCache.set(key, value, { ttl: ttlSec * 1000 });
  },

  async del(key: string): Promise<void> {
    if (redis) {
      await redis.del(key);
      return;
    }
    memoryCache.delete(key);
  },
};
