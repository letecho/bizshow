import { Router } from 'express';
import {
  ApproveCandidateSchema,
  CandidateListQuerySchema,
  HoldCandidateSchema,
  RejectCandidateSchema,
  diffCandidate,
  isEntityInScope,
  type AdminCandidate,
  type AdminCandidateDetail,
  type EntityScope,
} from '@fss/shared';
import { getAdmin } from '../../middleware/auth';
import { HttpError } from '../../middleware/errors';
import { CandidateConflictError, type ApproveCandidateArgs, type CandidateRepository } from '../../repositories/candidateRepository';
import type { ServiceAdminRepository } from '../../repositories/serviceRepository';
import { asyncHandler } from '../asyncHandler';
import { invalidateServiceCache } from '../serviceCache';
import { withSlugConflict } from './services';

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
  /** COLLECTOR_ENTITY_SCOPE。範囲外の種類（個人・不明など）は種類と根拠の入力なしに承認できない */
  entityScope: EntityScope;
  now?: () => Date;
}

/** /api/v1/admin/candidates: 掲載候補の一覧・詳細（既存掲載との差分）・承認・却下・保留（F-113） */
export function adminCandidatesRouter({ candidates, services, entityScope, now = () => new Date() }: AdminCandidatesRouterOptions): Router {
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
      };
      res.json({ data: detail });
    }),
  );

  router.post(
    '/:id/approve',
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      const { entityOverride, ...input } = ApproveCandidateSchema.parse(req.body);
      const candidate = await found(id);
      if (candidate.status !== 'pending' && candidate.status !== 'on_hold') {
        throw new HttpError(409, 'CONFLICT', `Candidate is already ${candidate.status}`);
      }
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
      }
      const result = await withConflict(() =>
        withSlugConflict(() => candidates.approve(id, { input, reviewer: getAdmin(res).sub, entity, now: now() })),
      );
      if (!result) throw notFound(id);
      await invalidateServiceCache(...[result.previousSlug, result.listing.slug].filter((s): s is string => !!s));
      res.json({ data: result });
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
