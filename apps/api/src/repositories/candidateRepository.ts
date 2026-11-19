import type {
  AdminCandidate,
  AdminService,
  AdminServiceInput,
  CandidateListQuery,
  EntityEvidence,
  EntityType,
  ListingSource,
} from '@fss/shared';
import type { ServiceAdminRepository } from './serviceRepository';

/** 承認・却下・保留できない状態（承認済み・却下済み） */
export class CandidateConflictError extends Error {
  constructor(readonly status: string) {
    super(`Candidate is already ${status}`);
    this.name = 'CandidateConflictError';
  }
}

export interface ApproveCandidateArgs {
  /** 管理者が確認・編集した掲載の全項目 */
  input: AdminServiceInput;
  /** 管理者の sub（メールアドレスは保存しない） */
  reviewer: string;
  /** 管理者が種類を変更した場合の種類と根拠 */
  entity?: { entityType: EntityType; evidence: EntityEvidence[] };
  now: Date;
}

export interface ApproveCandidateResult {
  candidate: AdminCandidate;
  listing: AdminService;
  /** 既存掲載を更新したときの更新前の slug（キャッシュ削除用） */
  previousSlug?: string;
}

/** 承認・再確認で掲載に記録する出典と確認日（F-116） */
export interface ListingProvenance {
  sources: ListingSource[];
  lastVerifiedAt: string;
  /** 未指定なら既存の値を変えない */
  corporateNumber?: string;
}

/** 掲載候補のレビュー（F-113）。Prisma 実装（本番）と InMemory 実装（テスト）を app に注入する */
export interface CandidateRepository {
  /** 対象言語の根拠あり → score 降順 → 作成順 */
  list(query: CandidateListQuery): Promise<{ items: AdminCandidate[]; total: number }>;
  findById(id: string): Promise<AdminCandidate | null>;
  /** 絞り込み用の収集元一覧 */
  listSources(): Promise<{ id: string; name: string }[]>;
  /**
   * pending / on_hold の候補を承認し、掲載を作成（update 候補は既存掲載を更新）する。
   * 不存在 null、処理済み CandidateConflictError、slug 重複 SlugConflictError（どちらも何も変更しない）
   */
  approve(id: string, args: ApproveCandidateArgs): Promise<ApproveCandidateResult | null>;
  /** pending / on_hold → rejected。不存在 null、処理済み CandidateConflictError */
  reject(id: string, reviewer: string, note: string | undefined, now: Date): Promise<AdminCandidate | null>;
  /** pending → on_hold。不存在 null、それ以外の状態は CandidateConflictError */
  hold(id: string, reviewer: string, note: string | undefined, now: Date): Promise<AdminCandidate | null>;
}

export const APPROVABLE_STATUSES = ['pending', 'on_hold'] as const;

/** 出典を追加（同じ出典表示・URL は重複させない） */
export function mergeSources(current: ListingSource[], added: ListingSource): ListingSource[] {
  const exists = current.some((s) => s.attribution === added.attribution && s.url === added.url);
  return exists ? current : [...current, added];
}

/** 候補の承認で作る・更新する掲載（update 候補で一致した掲載が残っていれば更新） */
export function approvalTarget(candidate: AdminCandidate): string | null {
  return candidate.matchType === 'update' && candidate.matchedListingId ? candidate.matchedListingId : null;
}

export interface InMemoryCandidateRecord extends AdminCandidate {
  /** DataSource.attribution */
  sourceAttribution: string;
}

/** テスト用。掲載の作成・更新は InMemory の掲載リポジトリに委ねる */
export function createInMemoryCandidateRepository(
  records: InMemoryCandidateRecord[],
  services: ServiceAdminRepository,
): CandidateRepository & { records: InMemoryCandidateRecord[] } {
  const strip = ({ sourceAttribution: _a, ...c }: InMemoryCandidateRecord): AdminCandidate => ({ ...c });
  const find = (id: string) => records.find((r) => r.id === id);
  const review = (record: InMemoryCandidateRecord, status: AdminCandidate['status'], reviewer: string, note: string | undefined, now: Date) => {
    Object.assign(record, { status, reviewedBy: reviewer, reviewedAt: now.toISOString(), reviewNote: note ?? null });
    return strip(record);
  };

  return {
    records,
    async list({ status, source, category, prefecture, minScore, targetLang, page, limit }) {
      const matched = records
        .filter((r) => r.status === status)
        .filter((r) => !source || r.sourceId === source)
        .filter((r) => !category || r.extracted.category === category)
        .filter((r) => !prefecture || r.extracted.prefecture === prefecture)
        .filter((r) => minScore === undefined || r.score >= minScore)
        .filter((r) => !targetLang || r.hasTargetLanguage)
        .sort(
          (a, b) =>
            Number(b.hasTargetLanguage) - Number(a.hasTargetLanguage) ||
            b.score - a.score ||
            a.createdAt.localeCompare(b.createdAt),
        );
      return { items: matched.slice((page - 1) * limit, page * limit).map(strip), total: matched.length };
    },

    async findById(id) {
      const record = find(id);
      return record ? strip(record) : null;
    },

    async listSources() {
      return [...new Map(records.map((r) => [r.sourceId, { id: r.sourceId, name: r.sourceName }])).values()];
    },

    async approve(id, { input, reviewer, entity, now }) {
      const record = find(id);
      if (!record) return null;
      if (!(APPROVABLE_STATUSES as readonly string[]).includes(record.status)) throw new CandidateConflictError(record.status);
      const source: ListingSource = { attribution: record.sourceAttribution, url: record.sourceUrl };
      const targetId = approvalTarget(record);
      const existing = targetId ? await services.adminFindById(targetId) : null;
      const provenance = (current: ListingSource[]): ListingProvenance => ({
        sources: mergeSources(current, source),
        lastVerifiedAt: now.toISOString(),
        corporateNumber: record.corporateNumber ?? record.extracted.corporateNumber,
      });
      const listing = existing
        ? await services.update(existing.id, input, provenance(existing.sources))
        : await services.create(input, provenance([]));
      if (!listing) return null;
      if (entity) Object.assign(record, { entityType: entity.entityType, entityEvidence: entity.evidence });
      review(record, 'approved', reviewer, undefined, now);
      record.matchedListingId = listing.id;
      return { candidate: strip(record), listing, previousSlug: existing?.slug };
    },

    async reject(id, reviewer, note, now) {
      const record = find(id);
      if (!record) return null;
      if (!(APPROVABLE_STATUSES as readonly string[]).includes(record.status)) throw new CandidateConflictError(record.status);
      return review(record, 'rejected', reviewer, note, now);
    },

    async hold(id, reviewer, note, now) {
      const record = find(id);
      if (!record) return null;
      if (record.status !== 'pending') throw new CandidateConflictError(record.status);
      return review(record, 'on_hold', reviewer, note, now);
    },
  };
}
