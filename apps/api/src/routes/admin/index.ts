import { Router, type RequestHandler } from 'express';
import { getAdmin } from '../../middleware/auth';

/** /api/v1/admin 配下。すべて requireAdmin を通す */
export function adminRouter(requireAdmin: RequestHandler): Router {
  const router = Router();
  router.use(requireAdmin);

  // ログイン中の管理者（Web のログイン確認用）
  router.get('/me', (_req, res) => {
    res.json({ data: getAdmin(res) });
  });

  return router;
}
