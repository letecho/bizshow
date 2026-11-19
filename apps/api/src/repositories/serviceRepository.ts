import type {
  AdminService,
  AdminServiceInput,
  AdminServiceListQuery,
  ServiceDetail,
  ServiceSearchQuery,
  ServiceSummary,
} from '@fss/shared';
import type { ListingProvenance } from './candidateRepository';

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
  /** staleBefore: 収集した掲載のうち、最終確認日が無いかこの日時より前のものに絞る（F-116） */
  adminList(query: AdminServiceListQuery & { staleBefore?: Date }): Promise<{ items: AdminService[]; total: number }>;
  adminFindById(id: string): Promise<AdminService | null>;
  /** provenance: 候補の承認で出典・確認日・法人番号を記録する（F-113 / F-116）。手入力では省略し既存の値を保つ */
  create(input: AdminServiceInput, provenance?: ListingProvenance): Promise<AdminService>;
  update(id: string, input: AdminServiceInput, provenance?: ListingProvenance): Promise<AdminService | null>;
  setPublished(id: string, isPublished: boolean): Promise<AdminService | null>;
  delete(id: string): Promise<AdminService | null>;
}
