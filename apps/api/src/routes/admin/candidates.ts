import { Router } from 'express';
import {
  ApproveCandidateSchema,
  CandidateListQuerySchema,
  HoldCandidateSchema,
  RejectCandidateSchema,
  buildDescriptionDraftRequest,
  descriptionDraftFacts,
  diffCandidate,
  parseDescriptionDraft,
  type BudgetedLlm,
  isEntityInScope,
  requiresConsent,
  type AdminCandidate,
  type AdminCandidateDetail,
  type EntityScope,
} from '@fss/shared';
import { getAdmin } from '../../middleware/auth';
import { HttpError } from '../../middleware/errors';
import { CandidateConflictError, type ApproveCandidateArgs, type CandidateRepository } from '../../repositories/candidateRepository';
import type { CategoryRepository } from '../../repositories/categoryRepository';
import type { ServiceAdminRepository } from '../../repositories/serviceRepository';
import { asyncHandler } from '../asyncHandler';
import { assertCategoriesExist } from '../categories';
import { invalidateServiceCache } from '../serviceCache';
import { withSlugConflict } from './services';

const isReviewable = (c: AdminCandidate) => c.status === 'pending' || c.status === 'on_hold';

const notFound = (id: string) => new HttpError(404, 'NOT_FOUND', `Candidate not found: ${id}`);

/** CandidateConflictError → 409 CONFLICT */
async function withConflict<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof CandidateConflictError) throw new HttpError(409, 'CONFLICT', err.message);
    throw err;
  }
}

export interface AdminCandidatesRouterOptions {
  candidates: CandidateRepository;
  services: ServiceAdminRepository;
  categories: CategoryRepository;
  /** COLLECTOR_ENTITY_SCOPE。範囲外の種類（個人・不明など）は種類と根拠の入力なしに承認できない */
  entityScope: EntityScope;
  /** 説明文の下書き（F-117）。COLLECTOR_LLM_* と ANTHROPIC_API_KEY が揃ったときだけ渡す */
  llm?: BudgetedLlm;
  now?: () => Date;
}

/** /api/v1/admin/candidates: 掲載候補の一覧・詳細（既存掲載との差分）・承認・却下・保留（F-113） */
export function adminCandidatesRouter({
  candidates,
  services,
  categories,
  entityScope,
  llm,
  now = () => new Date(),
}: AdminCandidatesRouterOptions): Router {
  const router = Router();

  const found = async (id: string): Promise<AdminCandidate> => {
    const candidate = await candidates.findById(id);
    if (!candidate) throw notFound(id);
    return candidate;
  };

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const query = CandidateListQuerySchema.parse(req.query);
      const [{ items, total }, sources] = await Promise.all([candidates.list(query), candidates.listSources()]);
      res.json({ data: items, meta: { page: query.page, limit: query.limit, total, sources } });
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const candidate = await found(String(req.params.id));
      const targetId = candidate.matchedListingId;
      const matchedListing = targetId ? await services.adminFindById(targetId) : null;
      const detail: AdminCandidateDetail = {
        ...candidate,
        matchedListing,
        diff: matchedListing ? diffCandidate(candidate.extracted, matchedListing) : [],
        entityApprovable: isEntityInScope(candidate.entityType, entityScope),
        consentRequired: requiresConsent(candidate.entityType, entityScope),
        descriptionDraftAvailable: Boolean(llm) && isReviewable(candidate),
      };
      res.json({ data: detail });
    }),
  );

  router.post(
    '/:id/approve',
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      const { entityOverride, consent, ...input } = ApproveCandidateSchema.parse(req.body);
      const candidate = await found(id);
      if (!isReviewable(candidate)) {
        throw new HttpError(409, 'CONFLICT', `Candidate is already ${candidate.status}`);
      }
      await assertCategoriesExist(categories, input.categories);
      let entity: ApproveCandidateArgs['entity'];
      if (!isEntityInScope(candidate.entityType, entityScope)) {
        // 個人情報に当たりうる候補（個人・不明）は、管理者が法人・公的機関と確認した根拠が無ければ公開しない
        if (!entityOverride || !isEntityInScope(entityOverride.entityType, entityScope)) {
          throw new HttpError(
            400,
            'VALIDATION_ERROR',
            `entityOverride is required: entity type ${candidate.entityType} is outside COLLECTOR_ENTITY_SCOPE (${entityScope})`,
          );
        }
        entity = {
          entityType: entityOverride.entityType,
          evidence: [...candidate.entityEvidence, { kind: 'admin_review' as const, value: entityOverride.evidence }],
        };
      } else if (requiresConsent(candidate.entityType, entityScope)) {
        // 個人事業主（の可能性がある）候補は、本人の同意の記録が無ければ公開しない（F-119、法務確認メモ 2.1 案 A）
        if (!consent) {
          throw new HttpError(
            400,
            'CONSENT_REQUIRED',
            `consent is required: entity type ${candidate.entityType} may be a sole proprietor (personal information)`,
          );
        }
        entity = {
          entityType: candidate.entityType,
          evidence: [...candidate.entityEvidence, { kind: 'consent' as const, value: consent.evidence }],
        };
      }
      const result = await withConflict(() =>
        withSlugConflict(() => candidates.approve(id, { input, reviewer: getAdmin(res).sub, entity, now: now() })),
      );
      if (!result) throw notFound(id);
      await invalidateServiceCache(...[result.previousSlug, result.listing.slug].filter((s): s is string => !!s));
      res.json({ data: result });
    }),
  );

  // 承認画面の「説明文の下書きを作成」（F-117）。入力は候補の事実だけ（収集元の文章は渡さない）。保存はしない
  router.post(
    '/:id/description-draft',
    asyncHandler(async (req, res) => {
      if (!llm) throw new HttpError(409, 'LLM_DISABLED', 'LLM is not enabled');
      const candidate = await found(String(req.params.id));
      if (!isReviewable(candidate)) throw new HttpError(409, 'CONFLICT', `Candidate is already ${candidate.status}`);
      let result;
      try {
        result = await llm.complete(buildDescriptionDraftRequest(descriptionDraftFacts(candidate.extracted)));
      } catch {
        // プロバイダのエラー内容（キー・リクエスト）は返さない
        throw new HttpError(502, 'LLM_UNAVAILABLE', 'The LLM request failed');
      }
      if (result.status === 'skipped_budget') {
        throw new HttpError(409, 'LLM_BUDGET_EXCEEDED', 'The monthly LLM budget has been reached');
      }
      const description = parseDescriptionDraft(result.text);
      if (!description) throw new HttpError(502, 'LLM_INVALID_OUTPUT', 'The LLM output did not pass validation');
      res.json({ data: { description } });
    }),
  );

  router.post(
    '/:id/reject',
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      const { reason } = RejectCandidateSchema.parse(req.body ?? {});
      const candidate = await withConflict(() => candidates.reject(id, getAdmin(res).sub, reason, now()));
      if (!candidate) throw notFound(id);
      res.json({ data: candidate });
    }),
  );

  router.post(
    '/:id/hold',
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      const { note } = HoldCandidateSchema.parse(req.body ?? {});
      const candidate = await withConflict(() => candidates.hold(id, getAdmin(res).sub, note, now()));
      if (!candidate) throw notFound(id);
      res.json({ data: candidate });
    }),
  );

  return router;
}
