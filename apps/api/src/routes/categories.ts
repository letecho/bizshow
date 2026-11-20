import { Router } from 'express';
import { CategoryInputSchema, appCache, type Category } from '@fss/shared';
import { HttpError } from '../middleware/errors';
import { CategoryConflictError, type CategoryRepository } from '../repositories/categoryRepository';
import { asyncHandler } from './asyncHandler';

export const CATEGORY_CACHE_KEY = 'categories:list';
export const CATEGORY_CACHE_TTL_SEC = 60;

/** カテゴリ一覧（appCache で 60 秒） */
async function cachedCategories(repo: CategoryRepository): Promise<Category[]> {
  const cached = await appCache.get(CATEGORY_CACHE_KEY);
  if (cached) return JSON.parse(cached) as Category[];
  const categories = await repo.list();
  await appCache.set(CATEGORY_CACHE_KEY, JSON.stringify(categories), CATEGORY_CACHE_TTL_SEC);
  return categories;
}

/**
 * 掲載の保存時に、カテゴリのコードがすべて登録済みか確認する。未登録があれば 400。
 * 追加直後のカテゴリも使えるよう、キャッシュではなくリポジトリを読む
 */
export async function assertCategoriesExist(repo: CategoryRepository, codes: readonly string[]): Promise<void> {
  const known = new Set((await repo.list()).map((c) => c.code));
  const unknown = codes.filter((code) => !known.has(code));
  if (unknown.length > 0) {
    throw new HttpError(400, 'VALIDATION_ERROR', `Unknown categories: ${unknown.join(', ')}`);
  }
}

/** GET /api/v1/categories（公開） */
export function categoriesRouter(repo: CategoryRepository): Router {
  const router = Router();
  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      res.json({ data: await cachedCategories(repo) });
    }),
  );
  return router;
}

/** POST /api/v1/admin/categories（requireAdmin 配下）。重複は 409 */
export function adminCategoriesRouter(repo: CategoryRepository): Router {
  const router = Router();
  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const input = CategoryInputSchema.parse(req.body);
      let category: Category;
      try {
        category = await repo.create(input);
      } catch (err) {
        if (err instanceof CategoryConflictError) throw new HttpError(409, 'CONFLICT', err.message);
        throw err;
      }
      await appCache.del(CATEGORY_CACHE_KEY);
      res.status(201).json({ data: category });
    }),
  );
  return router;
}
