import { Router, type RequestHandler } from 'express';
import { getAdmin } from '../../middleware/auth';
import type { ListingRequestRepository } from '../../repositories/listingRequestRepository';
import type { ServiceAdminRepository } from '../../repositories/serviceRepository';
import { adminListingRequestsRouter } from './listingRequests';
import { adminServicesRouter } from './services';

export interface AdminRouterOptions {
  requireAdmin: RequestHandler;
  services: ServiceAdminRepository;
  listingRequests: ListingRequestRepository;
}

/** /api/v1/admin 配下。すべて requireAdmin を通す */
export function adminRouter({ requireAdmin, services, listingRequests }: AdminRouterOptions): Router {
  const router = Router();
  router.use(requireAdmin);

  // ログイン中の管理者（Web のログイン確認用）
  router.get('/me', (_req, res) => {
    res.json({ data: getAdmin(res) });
  });

  router.use('/services', adminServicesRouter(services));
  router.use('/listing-requests', adminListingRequestsRouter(listingRequests, services));

  return router;
}
