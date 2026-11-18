export interface NewInquiry {
  name: string;
  email: string;
  message: string;
  locale: string;
}

export interface InquiryRecord extends NewInquiry {
  id: string;
  createdAt: Date;
}

/** お問い合わせの保存。Prisma 実装（本番）と InMemory 実装（テスト）を app に注入する */
export interface InquiryRepository {
  create(input: NewInquiry): Promise<InquiryRecord>;
}

export function createInMemoryInquiryRepository(store: InquiryRecord[] = []): InquiryRepository & {
  records: InquiryRecord[];
} {
  return {
    records: store,
    async create(input) {
      const record = { ...input, id: `inq-${store.length + 1}`, createdAt: new Date() };
      store.push(record);
      return record;
    },
  };
}
