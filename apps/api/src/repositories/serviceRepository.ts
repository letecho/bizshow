import type { ServiceSearchQuery, ServiceSummary } from '@fss/shared';

export interface ServiceSearchResult {
  items: ServiceSummary[];
  total: number;
}

/** 掲載サービスの取得。Prisma 実装（本番）と InMemory 実装（テスト）を app に注入する */
export interface ServiceRepository {
  /** 公開中のみ・updatedAt 降順・ページング */
  search(query: ServiceSearchQuery): Promise<ServiceSearchResult>;
}
