import { Router } from 'express';
import { AdminServiceInputSchema, AdminServiceListQuerySchema, PublishInputSchema, type AdminService } from '@fss/shared';
import { HttpError } from '../../middleware/errors';
import type { CategoryRepository } from '../../repositories/categoryRepository';
import { SlugConflictError, type ServiceAdminRepository } from '../../repositories/serviceRepository';
import { asyncHandler } from '../asyncHandler';
import { assertCategoriesExist } from '../categories';
import { invalidateServiceCache } from '../serviceCache';

const DAY_MS = 24 * 60 * 60 * 1000;

export const notFound = (id: string) => new HttpError(404, 'NOT_FOUND', `Service not found: ${id}`);

/** SlugConflictError → 409 CONFLICT */
export async function withSlugConflict<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof SlugConflictError) throw new HttpError(409, 'CONFLICT', err.message);
    throw err;
  }
}

/** /api/v1/admin/services: 掲載 CRUD・公開切替。更新系は公開キャッシュを無効化する */
export function adminServicesRouter(
  repo: ServiceAdminRepository,
  { staleDays, categories, now = () => new Date() }: { staleDays: number; categories: CategoryRepository; now?: () => Date },
): Router {
  const router = Router();

  const found = async (id: string): Promise<AdminService> => {
    const service = await repo.adminFindById(id);
    if (!service) throw notFound(id);
    return service;
  };

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const query = AdminServiceListQuerySchema.parse(req.query);
      const staleBefore = query.stale ? new Date(now().getTime() - staleDays * DAY_MS) : undefined;
      const { items, total } = await repo.adminList({ ...query, staleBefore });
      res.json({ data: items, meta: { page: query.page, limit: query.limit, total } });
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      res.json({ data: await found(String(req.params.id)) });
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const input = AdminServiceInputSchema.parse(req.body);
      await assertCategoriesExist(categories, input.categories);
      const service = await withSlugConflict(() => repo.create(input));
      await invalidateServiceCache(service.slug);
      res.status(201).json({ data: service });
    }),
  );

  router.put(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      const input = AdminServiceInputSchema.parse(req.body);
      await assertCategoriesExist(categories, input.categories);
      const before = await found(id);
      const service = await withSlugConflict(() => repo.update(id, input));
      if (!service) throw notFound(id);
      await invalidateServiceCache(before.slug, service.slug);
      res.json({ data: service });
    }),
  );

  router.patch(
    '/:id/publish',
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      const { isPublished } = PublishInputSchema.parse(req.body);
      const service = await repo.setPublished(id, isPublished);
      if (!service) throw notFound(id);
      await invalidateServiceCache(service.slug);
      res.json({ data: service });
    }),
  );

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      const service = await repo.delete(id);
      if (!service) throw notFound(id);
      await invalidateServiceCache(service.slug);
      res.status(204).end();
    }),
  );

  return router;
}
