import { Router } from 'express';
import { CrawlBlocklistInputSchema } from '@fss/shared';
import { HttpError } from '../../middleware/errors';
import type { BlocklistRepository } from '../../repositories/blocklistRepository';
import { asyncHandler } from '../asyncHandler';

/** /api/v1/admin/blocklist: 収集・クロールのブロックリスト（一覧・追加・削除、F-116） */
export function adminBlocklistRouter(repo: BlocklistRepository): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      const items = await repo.list();
      res.json({ data: items, meta: { total: items.length } });
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const input = CrawlBlocklistInputSchema.parse(req.body);
      res.status(201).json({ data: await repo.create(input) });
    }),
  );

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      const removed = await repo.delete(id);
      if (!removed) throw new HttpError(404, 'NOT_FOUND', `Blocklist entry not found: ${id}`);
      res.status(204).end();
    }),
  );

  return router;
}
