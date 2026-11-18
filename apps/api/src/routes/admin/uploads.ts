import { Router } from 'express';
import { UploadRequestSchema, type UploadTicket } from '@fss/shared';
import { imageUrlFor, newImageKey, type Storage } from '../../storage/storage';
import { asyncHandler } from '../asyncHandler';

/** POST /api/v1/admin/uploads: 掲載画像のアップロード先（presigned PUT URL）を発行 */
export function adminUploadsRouter(storage: Storage): Router {
  const router = Router();

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const request = UploadRequestSchema.parse(req.body);
      const key = newImageKey(request.contentType);
      const { url, headers } = await storage.createUploadUrl(key, request);
      const ticket: UploadTicket = { key, uploadUrl: url, headers, publicUrl: imageUrlFor(key)! };
      res.status(201).json({ data: ticket });
    }),
  );

  return router;
}
