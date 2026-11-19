import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  // LLM（F-117）: 無効・月額の上限到達・プロバイダの障害・出力が検証に通らない
  | 'LLM_DISABLED'
  | 'LLM_BUDGET_EXCEEDED'
  | 'LLM_UNAVAILABLE'
  | 'LLM_INVALID_OUTPUT';

/** ルートから throw すると status / code がそのままレスポンスになる */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, 'NOT_FOUND', `Route not found: ${req.method} ${req.path}`));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    const message = err.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  // 想定外のエラー: 詳細はログのみ。stack や内部メッセージは返さない
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
};
