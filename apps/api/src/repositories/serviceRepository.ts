import type {
  AdminService,
  AdminServiceInput,
  AdminServiceListQuery,
  ServiceDetail,
  ServiceSearchQuery,
  ServiceSummary,
} from '@fss/shared';

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

/** slug の重複（unique 制約違反） */
export class SlugConflictError extends Error {
  constructor(readonly slug: string) {
    super(`Slug already exists: ${slug}`);
    this.name = 'SlugConflictError';
  }
}

/** 管理画面用（非公開を含む）。不存在は null、slug 重複は SlugConflictError */
export interface ServiceAdminRepository {
  adminList(query: AdminServiceListQuery): Promise<{ items: AdminService[]; total: number }>;
  adminFindById(id: string): Promise<AdminService | null>;
  create(input: AdminServiceInput): Promise<AdminService>;
  update(id: string, input: AdminServiceInput): Promise<AdminService | null>;
  setPublished(id: string, isPublished: boolean): Promise<AdminService | null>;
  delete(id: string): Promise<AdminService | null>;
}
