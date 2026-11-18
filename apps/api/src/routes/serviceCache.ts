import { appCache, type ServiceSearchQuery } from '@fss/shared';

export const SERVICE_CACHE_TTL_SEC = 60;
const VERSION_KEY = 'services:cache-version';

/**
 * 検索結果のキャッシュキー。世代番号を含めることで、掲載更新時に全検索キャッシュを一括で無効化できる。
 * 未指定項目を除きキー順を固定する
 */
export async function searchCacheKey(query: ServiceSearchQuery): Promise<string> {
  const version = (await appCache.get(VERSION_KEY)) ?? '0';
  const normalized = Object.entries(query)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `services:search:${version}:${JSON.stringify(normalized)}`;
}

export const detailCacheKey = (slug: string) => `services:detail:${slug}`;

/** 掲載の作成・更新・公開切替・削除時に呼ぶ。検索は世代を進め、詳細は該当 slug を削除 */
export async function invalidateServiceCache(...slugs: string[]): Promise<void> {
  await appCache.set(VERSION_KEY, `${Date.now()}-${Math.random().toString(36).slice(2)}`, 24 * 60 * 60);
  await Promise.all([...new Set(slugs)].map((slug) => appCache.del(detailCacheKey(slug))));
}
