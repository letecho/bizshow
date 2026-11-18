import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import express, { Router } from 'express';
import { IMAGE_CONTENT_TYPES, IMAGE_MAX_BYTES } from '@fss/shared';
import { HttpError } from '../middleware/errors';
import type { LocalStorage } from '../storage/storage';

/**
 * STORAGE_DRIVER=local 用（S3 の代替）。
 * - PUT /api/v1/uploads/local?token=...: 署名・期限・Content-Type・サイズを検証して保存
 * - GET /uploads/<key>: 保存した画像を配信
 */
export function localUploadsRouter(storage: LocalStorage, dir: string): Router {
  const router = Router();
  const root = path.resolve(dir);

  router.put(
    '/api/v1/uploads/local',
    express.raw({ type: [...IMAGE_CONTENT_TYPES], limit: IMAGE_MAX_BYTES }),
    (req, res, next) => {
      const claims = storage.verify(String(req.query.token ?? ''));
      if (!claims) return next(new HttpError(403, 'FORBIDDEN', 'Invalid or expired upload URL'));
      const body = req.body as unknown;
      if (req.headers['content-type'] !== claims.contentType || !Buffer.isBuffer(body) || body.length !== claims.size) {
        return next(new HttpError(400, 'VALIDATION_ERROR', 'Content-Type or size does not match the upload URL'));
      }
      const file = path.join(root, claims.key);
      mkdir(path.dirname(file), { recursive: true })
        .then(() => writeFile(file, body))
        .then(() => res.status(200).end(), next);
    },
  );

  router.use(
    '/uploads',
    express.static(root, {
      fallthrough: true,
      // Web（別オリジン）から <img> で読めるよう helmet の CORP same-origin を上書き
      setHeaders: (res) => res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'),
    }),
  );

  return router;
}
