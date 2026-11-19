import type { CrawlBlockEntry, CrawlBlocklistInput } from '@fss/shared';

/** 収集・クロールのブロックリスト（F-116）。Prisma 実装（本番）と InMemory 実装（テスト）を app に注入する */
export interface BlocklistRepository {
  /** createdAt 降順 */
  list(): Promise<CrawlBlockEntry[]>;
  create(input: CrawlBlocklistInput): Promise<CrawlBlockEntry>;
  /** 不存在は null */
  delete(id: string): Promise<CrawlBlockEntry | null>;
}

export function createInMemoryBlocklistRepository(store: CrawlBlockEntry[] = []): BlocklistRepository & {
  entries: CrawlBlockEntry[];
} {
  let seq = 0;
  return {
    entries: store,
    async list() {
      return [...store].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async create(input) {
      seq += 1;
      const entry: CrawlBlockEntry = {
        id: `block-${seq}`,
        domain: input.domain ?? null,
        corporateNumber: input.corporateNumber ?? null,
        reason: input.reason,
        note: input.note ?? null,
        createdAt: new Date().toISOString(),
      };
      store.push(entry);
      return entry;
    },
    async delete(id) {
      const index = store.findIndex((e) => e.id === id);
      if (index < 0) return null;
      return store.splice(index, 1)[0];
    },
  };
}
