import { Router } from 'express';
import { ListingRequestInputSchema } from '@fss/shared';
import type { CategoryRepository } from '../repositories/categoryRepository';
import type { ListingRequestRepository } from '../repositories/listingRequestRepository';
import { asyncHandler } from './asyncHandler';
import { assertCategoriesExist } from './categories';

export function listingRequestsRouter(repo: ListingRequestRepository, categories: CategoryRepository): Router {
  const router = Router();

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const input = ListingRequestInputSchema.parse(req.body);
      await assertCategoriesExist(categories, input.categories);
      const record = await repo.create(input);
      res.status(201).json({ data: { id: record.id, status: record.status } });
    }),
  );

  return router;
}
