import type { PrismaClient } from '@prisma/client';
import type { LlmUsageStore } from '@fss/shared';

/** LlmUsage テーブルへの使用量の記録（F-117） */
export function createPrismaLlmUsageStore(prisma: PrismaClient): LlmUsageStore {
  return {
    async monthCostJpy(month) {
      const { _sum } = await prisma.llmUsage.aggregate({ where: { month }, _sum: { costJpy: true } });
      return _sum.costJpy ?? 0;
    },
    async record(entry) {
      await prisma.llmUsage.create({ data: entry });
    },
  };
}
