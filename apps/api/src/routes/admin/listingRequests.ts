import { Router } from 'express';
import { ApproveListingRequestSchema, ListingRequestListQuerySchema } from '@fss/shared';
import { HttpError } from '../../middleware/errors';
import type { CategoryRepository } from '../../repositories/categoryRepository';
import type { ListingRequestRecord, ListingRequestRepository } from '../../repositories/listingRequestRepository';
import type { ServiceAdminRepository } from '../../repositories/serviceRepository';
import { asyncHandler } from '../asyncHandler';
import { assertCategoriesExist } from '../categories';
import { invalidateServiceCache } from '../serviceCache';
import { withSlugConflict } from './services';

/** /api/v1/admin/listing-requests: 申請一覧・承認（→ ServiceListing 作成）・却下 */
export function adminListingRequestsRouter(
  requests: ListingRequestRepository,
  services: ServiceAdminRepository,
  categories: CategoryRepository,
): Router {
  const router = Router();

  /** pending の申請を取得。不存在 404、処理済み 409 */
  const pending = async (id: string): Promise<ListingRequestRecord> => {
    const record = await requests.findById(id);
    if (!record) throw new HttpError(404, 'NOT_FOUND', `Listing request not found: ${id}`);
    if (record.status !== 'pending') throw new HttpError(409, 'CONFLICT', `Listing request is already ${record.status}`);
    return record;
  };

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const query = ListingRequestListQuerySchema.parse(req.query);
      const { items, total } = await requests.list(query);
      res.json({ data: items, meta: { page: query.page, limit: query.limit, total } });
    }),
  );

  router.post(
    '/:id/approve',
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      const { slug, isPublished } = ApproveListingRequestSchema.parse(req.body);
      const record = await pending(id);
      const {
        id: _id,
        status: _status,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        contactName: _contactName,
        contactEmail: _contactEmail,
        ...fields
      } = record;
      await assertCategoriesExist(categories, fields.categories);
      const service = await withSlugConflict(() => services.create({ ...fields, slug, isPublished }));
      const approved = await requests.setStatus(id, 'approved');
      await invalidateServiceCache(service.slug);
      res.status(201).json({ data: { request: approved, service } });
    }),
  );

  router.post(
    '/:id/reject',
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      await pending(id);
      res.json({ data: await requests.setStatus(id, 'rejected') });
    }),
  );

  return router;
}
