import { Router } from 'express';
import { ServiceSearchQuerySchema, appCache, type ServiceSearchQuery } from '@fss/shared';
import { HttpError } from '../middleware/errors';
import type { ServiceRepository } from '../repositories/serviceRepository';
import { asyncHandler } from './asyncHandler';

const CACHE_TTL_SEC = 60;

/** 未指定項目を除きキー順を固定したキャッシュキー */
function searchCacheKey(query: ServiceSearchQuery): string {
  const normalized = Object.entries(query)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `services:search:${JSON.stringify(normalized)}`;
}

export function servicesRouter(repo: ServiceRepository): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const query = ServiceSearchQuerySchema.parse(req.query);
      const key = searchCacheKey(query);

      const cached = await appCache.get(key);
      if (cached) {
        res.json(JSON.parse(cached));
        return;
      }

      const { items, total } = await repo.search(query);
      const body = { data: items, meta: { page: query.page, limit: query.limit, total } };
      await appCache.set(key, JSON.stringify(body), CACHE_TTL_SEC);
      res.json(body);
    }),
  );

  router.get(
    '/:slug',
    asyncHandler(async (req, res) => {
      const slug = String(req.params.slug);
      const key = `services:detail:${slug}`;

      const cached = await appCache.get(key);
      if (cached) {
        res.json(JSON.parse(cached));
        return;
      }

      const service = await repo.findBySlug(slug);
      if (!service) throw new HttpError(404, 'NOT_FOUND', `Service not found: ${slug}`);

      const body = { data: service };
      await appCache.set(key, JSON.stringify(body), CACHE_TTL_SEC);
      res.json(body);
    }),
  );

  return router;
}
