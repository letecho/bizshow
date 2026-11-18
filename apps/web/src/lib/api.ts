import type { ServiceDetail, ServiceSummary } from '@fss/shared/domain';

/** ブラウザから呼ぶ API の URL（ビルド時に埋め込まれる） */
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

/**
 * サーバー側（SSR・server action）から呼ぶ API の URL。
 * Docker などブラウザとサーバーで API の宛先が異なる場合に API_INTERNAL_URL を設定する（未設定 = API_URL）
 */
export function serverApiUrl(): string {
  return process.env.API_INTERNAL_URL || API_URL;
}

export interface SearchMeta {
  page: number;
  limit: number;
  total: number;
}

export type ApiResult<T> = { ok: true; value: T } | { ok: false; status: number | null };

/** API 呼び出し（サーバー側専用）。ネットワーク障害・非2xxでも例外を投げず ok:false を返す */
async function getJson<T>(path: string): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${serverApiUrl()}${path}`, { cache: 'no-store' });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, value: (await res.json()) as T };
  } catch {
    return { ok: false, status: null };
  }
}

/** Next.js の searchParams を文字列のみのクエリに変換（配列は先頭値） */
export function toQueryString(searchParams: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    const v = Array.isArray(value) ? value[0] : value;
    if (v !== undefined) params.set(key, v);
  }
  return params.toString();
}

export function searchServices(query: string) {
  return getJson<{ data: ServiceSummary[]; meta: SearchMeta }>(`/api/v1/services${query ? `?${query}` : ''}`);
}

export function getService(slug: string) {
  return getJson<{ data: ServiceDetail }>(`/api/v1/services/${encodeURIComponent(slug)}`);
}
