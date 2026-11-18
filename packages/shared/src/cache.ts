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
// 固定ウィンドウのカウンタ（レート制限等）。キャッシュ本体とは別枠にして追い出しを防ぐ
const memoryCounters = new LRUCache<string, { count: number; resetAt: number }>({ max: 10_000 });

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

  /**
   * key のカウンタを 1 増やす。初回で windowMs の有効期限を設定する（固定ウィンドウ）。
   * 戻り値の resetAt はカウンタが消える時刻（epoch ms）
   */
  async incr(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
    if (redis) {
      const results = await redis.multi().incr(key).pexpire(key, windowMs, 'NX').pttl(key).exec();
      const count = Number(results?.[0]?.[1] ?? 1);
      const ttl = Number(results?.[2]?.[1] ?? -1);
      return { count, resetAt: Date.now() + (ttl > 0 ? ttl : windowMs) };
    }
    const now = Date.now();
    const current = memoryCounters.get(key);
    const entry = current && current.resetAt > now ? current : { count: 0, resetAt: now + windowMs };
    entry.count += 1;
    memoryCounters.set(key, entry, { ttl: entry.resetAt - now });
    return { ...entry };
  },

  async del(key: string): Promise<void> {
    if (redis) {
      await redis.del(key);
      return;
    }
    memoryCache.delete(key);
    memoryCounters.delete(key);
  },
};
