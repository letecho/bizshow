import { Router, type RequestHandler } from 'express';
import { getAdmin } from '../../middleware/auth';
import type { ListingRequestRepository } from '../../repositories/listingRequestRepository';
import type { ServiceAdminRepository } from '../../repositories/serviceRepository';
import type { Storage } from '../../storage/storage';
import { adminListingRequestsRouter } from './listingRequests';
import { adminServicesRouter } from './services';
import { adminUploadsRouter } from './uploads';

export interface AdminRouterOptions {
  requireAdmin: RequestHandler;
  services: ServiceAdminRepository;
  listingRequests: ListingRequestRepository;
  storage: Storage;
}

/** /api/v1/admin 配下。すべて requireAdmin を通す */
export function adminRouter({ requireAdmin, services, listingRequests, storage }: AdminRouterOptions): Router {
  const router = Router();
  router.use(requireAdmin);

  // ログイン中の管理者（Web のログイン確認用）
  router.get('/me', (_req, res) => {
    res.json({ data: getAdmin(res) });
  });

  router.use('/services', adminServicesRouter(services));
  router.use('/listing-requests', adminListingRequestsRouter(listingRequests, services));
  router.use('/uploads', adminUploadsRouter(storage));

  return router;
}
