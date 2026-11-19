import { Router, type RequestHandler } from 'express';
import { getAdmin } from '../../middleware/auth';
import type { BudgetedLlm, EntityScope } from '@fss/shared';
import type { BlocklistRepository } from '../../repositories/blocklistRepository';
import type { CandidateRepository } from '../../repositories/candidateRepository';
import type { ListingRequestRepository } from '../../repositories/listingRequestRepository';
import type { ServiceAdminRepository } from '../../repositories/serviceRepository';
import type { Storage } from '../../storage/storage';
import { adminBlocklistRouter } from './blocklist';
import { adminCandidatesRouter } from './candidates';
import { adminListingRequestsRouter } from './listingRequests';
import { adminServicesRouter } from './services';
import { adminUploadsRouter } from './uploads';

export interface AdminRouterOptions {
  requireAdmin: RequestHandler;
  services: ServiceAdminRepository;
  listingRequests: ListingRequestRepository;
  storage: Storage;
  blocklist: BlocklistRepository;
  /** /services?stale=true の基準（COLLECTOR_STALE_DAYS） */
  staleDays: number;
  candidates: CandidateRepository;
  /** 候補の承認で認める事業者の種類（COLLECTOR_ENTITY_SCOPE） */
  entityScope: EntityScope;
  /** 説明文の下書き（F-117） */
  llm?: BudgetedLlm;
}

/** /api/v1/admin 配下。すべて requireAdmin を通す */
export function adminRouter({
  requireAdmin,
  services,
  listingRequests,
  storage,
  blocklist,
  staleDays,
  candidates,
  entityScope,
  llm,
}: AdminRouterOptions): Router {
  const router = Router();
  router.use(requireAdmin);

  // ログイン中の管理者（Web のログイン確認用）
  router.get('/me', (_req, res) => {
    res.json({ data: getAdmin(res) });
  });

  router.use('/services', adminServicesRouter(services, { staleDays }));
  router.use('/listing-requests', adminListingRequestsRouter(listingRequests, services));
  router.use('/uploads', adminUploadsRouter(storage));
  router.use('/blocklist', adminBlocklistRouter(blocklist));
  router.use('/candidates', adminCandidatesRouter({ candidates, services, entityScope, llm }));

  return router;
}
