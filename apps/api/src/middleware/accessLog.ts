import type { RequestHandler } from 'express';

const EXCLUDED_PATHS = new Set(['/health']);

/** 1リクエスト1行のJSONアクセスログ（method, path, status, ms） */
export function accessLog(write: (line: string) => void = console.log): RequestHandler {
  return (req, res, next) => {
    // Router 配下では req.path が相対パスになるため originalUrl から取る
    const path = req.originalUrl.split('?')[0];
    if (EXCLUDED_PATHS.has(path)) return next();
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      write(JSON.stringify({ method: req.method, path, status: res.statusCode, ms: Math.round(ms * 10) / 10 }));
    });
    next();
  };
}
