import type { SourceAdapter } from '../types';

/**
 * 収集元アダプターの登録。キーは DataSource.id。
 * 例: F-112 で mhlw-medical（医療情報ネットのオープンデータ）を追加する。
 */
export const sourceAdapters: Record<string, SourceAdapter> = {};
