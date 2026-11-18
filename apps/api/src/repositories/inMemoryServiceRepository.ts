import type { ServiceDetail } from '@fss/shared';
import type { ServiceRepository } from './serviceRepository';

export interface InMemoryServiceRecord extends ServiceDetail {
  isPublished: boolean;
  /** 全言語の name + description を小文字連結したもの */
  searchText: string;
}

/** テスト・ローカル用。Prisma 実装と同じ絞り込み・並び順を再現する */
export function createInMemoryServiceRepository(records: InMemoryServiceRecord[]): ServiceRepository {
  return {
    async search({ q, category, prefecture, lang, page, limit }) {
      const needle = q?.toLowerCase();
      const matched = records
        .filter((r) => r.isPublished)
        .filter((r) => !category || r.category === category)
        .filter((r) => !prefecture || r.prefecture === prefecture)
        .filter((r) => !lang || r.supportedLanguages.includes(lang))
        .filter((r) => !needle || r.searchText.toLowerCase().includes(needle))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const items = matched
        .slice((page - 1) * limit, page * limit)
        .map(({ id, slug, category, prefecture, city, supportedLanguages, name }) => ({
          id,
          slug,
          category,
          prefecture,
          city,
          supportedLanguages,
          name,
        }));
      return { items, total: matched.length };
    },

    async findBySlug(slug) {
      const record = records.find((r) => r.slug === slug && r.isPublished);
      if (!record) return null;
      const { isPublished: _isPublished, searchText: _searchText, ...detail } = record;
      return detail;
    },
  };
}
