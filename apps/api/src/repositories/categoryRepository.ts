import { INITIAL_CATEGORIES, type Category, type CategoryInput } from '@fss/shared';

/** code の重複（主キー違反） */
export class CategoryConflictError extends Error {
  constructor(readonly code: string) {
    super(`Category already exists: ${code}`);
    this.name = 'CategoryConflictError';
  }
}

/** カテゴリ（F-121）。Prisma 実装（本番）と InMemory 実装（テスト）を app に注入する */
export interface CategoryRepository {
  /** sortOrder, code の順 */
  list(): Promise<Category[]>;
  /** 既存のカテゴリの末尾に追加する。code の重複は CategoryConflictError */
  create(input: CategoryInput): Promise<Category>;
}

/** テスト・ローカル用。既定で初期 8 カテゴリを持つ */
export function createInMemoryCategoryRepository(
  initial: Category[] = INITIAL_CATEGORIES,
): CategoryRepository & { records: Category[] } {
  const records = initial.map((c) => ({ code: c.code, name: { ...c.name } }));
  return {
    records,
    async list() {
      return records.map((c) => ({ code: c.code, name: { ...c.name } }));
    },
    async create({ code, name }) {
      if (records.some((c) => c.code === code)) throw new CategoryConflictError(code);
      const category: Category = { code, name };
      records.push(category);
      return { code, name: { ...name } };
    },
  };
}
