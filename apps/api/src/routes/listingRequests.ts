import { Router } from 'express';
import { ListingRequestInputSchema } from '@fss/shared';
import type { ListingRequestRepository } from '../repositories/listingRequestRepository';
import { asyncHandler } from './asyncHandler';

export function listingRequestsRouter(repo: ListingRequestRepository): Router {
  const router = Router();

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const input = ListingRequestInputSchema.parse(req.body);
      const record = await repo.create(input);
      res.status(201).json({ data: { id: record.id, status: record.status } });
    }),
  );

  return router;
}
