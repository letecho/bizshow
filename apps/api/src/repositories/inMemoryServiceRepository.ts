import type { AdminService, AdminServiceInput } from '@fss/shared';
import { buildSearchText } from '../db/searchText';
import { imageUrlFor } from '../storage/storage';
import type { ListingProvenance } from './candidateRepository';
import { SlugConflictError, type ServiceAdminRepository, type ServiceRepository } from './serviceRepository';

/** imageUrl は imageKey から導出するため保持しない */
export interface InMemoryServiceRecord extends Omit<AdminService, 'imageUrl'> {
  /** 全言語の name + description を小文字連結したもの */
  searchText: string;
}

function toAdminService({ searchText: _searchText, ...service }: InMemoryServiceRecord): AdminService {
  return { ...service, imageUrl: imageUrlFor(service.imageKey) };
}

function fromInput(input: AdminServiceInput) {
  return {
    ...input,
    city: input.city ?? null,
    address: input.address ?? null,
    phone: input.phone ?? null,
    websiteUrl: input.websiteUrl ?? null,
    imageKey: input.imageKey ?? null,
    searchText: buildSearchText(input.name, input.description),
  };
}

/** 出典・確認日（法人番号は AdminService に含めないため InMemory では保持しない） */
function fromProvenance(provenance?: ListingProvenance): Partial<InMemoryServiceRecord> {
  return provenance ? { sources: provenance.sources, lastVerifiedAt: provenance.lastVerifiedAt } : {};
}

/** テスト・ローカル用。Prisma 実装と同じ絞り込み・並び順を再現する */
export function createInMemoryServiceRepository(
  records: InMemoryServiceRecord[],
): ServiceRepository & ServiceAdminRepository {
  let seq = 0;
  const byUpdatedDesc = (a: InMemoryServiceRecord, b: InMemoryServiceRecord) => b.updatedAt.localeCompare(a.updatedAt);
  const assertSlugFree = (slug: string, exceptId?: string) => {
    if (records.some((r) => r.slug === slug && r.id !== exceptId)) throw new SlugConflictError(slug);
  };
  const modify = (id: string, change: Partial<InMemoryServiceRecord>) => {
    const record = records.find((r) => r.id === id);
    if (!record) return null;
    Object.assign(record, change, { updatedAt: new Date().toISOString() });
    return toAdminService(record);
  };

  return {
    async search({ q, category, prefecture, lang, page, limit }) {
      const needle = q?.toLowerCase();
      const matched = records
        .filter((r) => r.isPublished)
        .filter((r) => !category || r.categories.includes(category))
        .filter((r) => !prefecture || r.prefecture === prefecture)
        .filter((r) => !lang || r.supportedLanguages.includes(lang))
        .filter((r) => !needle || r.searchText.toLowerCase().includes(needle))
        .sort(byUpdatedDesc);
      const items = matched
        .slice((page - 1) * limit, page * limit)
        .map(({ id, slug, categories, prefecture, city, supportedLanguages, name }) => ({
          id,
          slug,
          categories,
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
      const { isPublished: _isPublished, createdAt: _createdAt, imageKey: _imageKey, ...detail } = toAdminService(record);
      return detail;
    },

    async adminList({ q, published, staleBefore, page, limit }) {
      const needle = q?.toLowerCase();
      const matched = records
        .filter((r) => published === undefined || r.isPublished === published)
        .filter(
          (r) =>
            !staleBefore ||
            (r.sources.length > 0 && (!r.lastVerifiedAt || new Date(r.lastVerifiedAt) < staleBefore)),
        )
        .filter((r) => !needle || r.searchText.includes(needle) || r.slug.includes(needle))
        .sort(byUpdatedDesc);
      return { items: matched.slice((page - 1) * limit, page * limit).map(toAdminService), total: matched.length };
    },

    async adminFindById(id) {
      const record = records.find((r) => r.id === id);
      return record ? toAdminService(record) : null;
    },

    async create(input, provenance) {
      assertSlugFree(input.slug);
      seq += 1;
      const now = new Date().toISOString();
      const record: InMemoryServiceRecord = {
        ...fromInput(input),
        id: `new-${seq}`,
        sources: provenance?.sources ?? [],
        lastVerifiedAt: provenance?.lastVerifiedAt ?? null,
        createdAt: now,
        updatedAt: now,
      };
      records.push(record);
      return toAdminService(record);
    },

    async update(id, input, provenance) {
      assertSlugFree(input.slug, id);
      return modify(id, { ...fromInput(input), ...fromProvenance(provenance) });
    },

    async setPublished(id, isPublished) {
      return modify(id, { isPublished });
    },

    async delete(id) {
      const index = records.findIndex((r) => r.id === id);
      if (index < 0) return null;
      const [removed] = records.splice(index, 1);
      return toAdminService(removed);
    },
  };
}
