import type { RequestHandler } from 'express';

/** Express 4 は async の例外を拾わないため next に渡す */
export const asyncHandler =
  (fn: RequestHandler): RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
