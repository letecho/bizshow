import { Prisma, type CrawlBlocklist, type PrismaClient } from '@prisma/client';
import type { CrawlBlockEntry } from '@fss/shared';
import type { BlocklistRepository } from './blocklistRepository';

function toEntry(row: CrawlBlocklist): CrawlBlockEntry {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

export function createPrismaBlocklistRepository(prisma: PrismaClient): BlocklistRepository {
  return {
    async list() {
      const rows = await prisma.crawlBlocklist.findMany({ orderBy: { createdAt: 'desc' } });
      return rows.map(toEntry);
    },

    async create(input) {
      const row = await prisma.crawlBlocklist.create({
        data: {
          domain: input.domain ?? null,
          corporateNumber: input.corporateNumber ?? null,
          reason: input.reason,
          note: input.note ?? null,
        },
      });
      return toEntry(row);
    },

    async delete(id) {
      try {
        return toEntry(await prisma.crawlBlocklist.delete({ where: { id } }));
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') return null;
        throw err;
      }
    },
  };
}
