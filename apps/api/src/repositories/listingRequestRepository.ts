import type { ListingRequestInput, ListingRequestStatus } from '@fss/shared';

export interface ListingRequestRecord extends ListingRequestInput {
  id: string;
  status: ListingRequestStatus;
  createdAt: Date;
  updatedAt: Date;
}

/** 掲載申請の保存。Prisma 実装（本番）と InMemory 実装（テスト）を app に注入する */
export interface ListingRequestRepository {
  /** status = pending で保存 */
  create(input: ListingRequestInput): Promise<ListingRequestRecord>;
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
  };
}
