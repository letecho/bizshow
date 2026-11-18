import type { ServiceDetail, ServiceSearchQuery, ServiceSummary } from '@fss/shared';

export interface ServiceSearchResult {
  items: ServiceSummary[];
  total: number;
}

/** 掲載サービスの取得。Prisma 実装（本番）と InMemory 実装（テスト）を app に注入する */
export interface ServiceRepository {
  /** 公開中のみ・updatedAt 降順・ページング */
  search(query: ServiceSearchQuery): Promise<ServiceSearchResult>;
  /** 公開中のみ。未公開・不存在は null */
  findBySlug(slug: string): Promise<ServiceDetail | null>;
}
