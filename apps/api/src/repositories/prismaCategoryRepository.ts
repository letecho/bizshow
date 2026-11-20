import type { PrismaClient } from '@prisma/client';
import type { Category, LocalizedText } from '@fss/shared';
import { CategoryConflictError, type CategoryRepository } from './categoryRepository';
import { isPrismaError } from './prismaServiceRepository';

const toCategory = (row: { code: string; name: unknown }): Category => ({ code: row.code, name: row.name as LocalizedText });

export function createPrismaCategoryRepository(prisma: PrismaClient): CategoryRepository {
  return {
    async list() {
      const rows = await prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] });
      return rows.map(toCategory);
    },

    async create({ code, name }) {
      const last = await prisma.category.aggregate({ _max: { sortOrder: true } });
      try {
        const row = await prisma.category.create({
          data: { code, name, sortOrder: (last._max.sortOrder ?? -1) + 1 },
        });
        return toCategory(row);
      } catch (err) {
        if (isPrismaError(err, 'P2002')) throw new CategoryConflictError(code);
        throw err;
      }
    },
  };
}
