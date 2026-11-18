import type { ListingRequestInput, ListingRequestListQuery, ListingRequestStatus } from '@fss/shared';

export interface ListingRequestRecord extends ListingRequestInput {
  id: string;
  status: ListingRequestStatus;
  createdAt: Date;
  updatedAt: Date;
}

/** 掲載申請の保存・管理。Prisma 実装（本番）と InMemory 実装（テスト）を app に注入する */
export interface ListingRequestRepository {
  /** status = pending で保存 */
  create(input: ListingRequestInput): Promise<ListingRequestRecord>;
  /** createdAt 降順 */
  list(query: ListingRequestListQuery): Promise<{ items: ListingRequestRecord[]; total: number }>;
  findById(id: string): Promise<ListingRequestRecord | null>;
  setStatus(id: string, status: ListingRequestStatus): Promise<ListingRequestRecord | null>;
}

export function createInMemoryListingRequestRepository(store: ListingRequestRecord[] = []): ListingRequestRepository & {
  records: ListingRequestRecord[];
} {
  return {
    records: store,
    async create(input) {
      const now = new Date();
      const record: ListingRequestRecord = {
        ...input,
        id: `req-${store.length + 1}`,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      };
      store.push(record);
      return record;
    },
    async list({ status, page, limit }) {
      const matched = store
        .filter((r) => !status || r.status === status)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return { items: matched.slice((page - 1) * limit, page * limit), total: matched.length };
    },
    async findById(id) {
      return store.find((r) => r.id === id) ?? null;
    },
    async setStatus(id, status) {
      const record = store.find((r) => r.id === id);
      if (!record) return null;
      Object.assign(record, { status, updatedAt: new Date() });
      return record;
    },
  };
}
