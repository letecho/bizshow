import type { RequestHandler } from 'express';
import { rateLimit, type Store } from 'express-rate-limit';
import { appCache } from '@fss/shared';
import { HttpError } from './errors';

export interface RateLimitOptions {
  /** ウィンドウ内の上限リクエスト数（既定 120） */
  limit?: number;
  /** ウィンドウ長 ms（既定 60 秒） */
  windowMs?: number;
}

/**
 * appCache のカウンタを使うストア。REDIS_URL 設定時は Valkey 共有カウンタになり、
 * 複数タスク間で同じ上限を共有できる。
 */
export function createAppCacheStore(windowMs: number, prefix = 'rl:global:'): Store {
  return {
    prefix,
    localKeys: false,
    async increment(key) {
      const { count, resetAt } = await appCache.incr(prefix + key, windowMs);
      return { totalHits: count, resetTime: new Date(resetAt) };
    },
    async decrement() {
      // skipFailedRequests 等を使わないため不要
    },
    async resetKey(key) {
      await appCache.del(prefix + key);
    },
  };
}

/** 全体のレート制限（既定 120 req/分/IP）。/health はヘルスチェックのため対象外 */
export function globalRateLimit({ limit = 120, windowMs = 60_000 }: RateLimitOptions = {}): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // REDIS_URL 未設定時は express-rate-limit 標準のメモリストア（app インスタンス毎）
    store: appCache.isDistributed() ? createAppCacheStore(windowMs) : undefined,
    skip: (req) => req.path === '/health',
    handler: (_req, _res, next) => next(new HttpError(429, 'RATE_LIMITED', 'Too many requests. Please try again later.')),
  });
}

/**
 * env TRUST_PROXY を Express の `trust proxy` 設定値に変換する。
 * - 未設定 / "false": 信頼しない（ローカル直結）
 * - "true": すべて信頼（非推奨: X-Forwarded-For を偽装されうる）
 * - 数値: 信頼するプロキシのホップ数（例: Cloudflare → ALB なら 2）
 * - それ以外: IP / CIDR のカンマ区切り（Express の書式そのまま）
 */
export function parseTrustProxy(value: string | undefined): boolean | number | string {
  const v = value?.trim();
  if (!v || v === 'false') return false;
  if (v === 'true') return true;
  if (/^\d+$/.test(v)) return Number(v);
  return v;
}
