import type { PrismaClient } from '@prisma/client';
import { SEED_LISTINGS } from './seedData';

/** シードデータを slug をキーに upsert する（何度実行しても同じ結果） */
export async function seed(prisma: PrismaClient): Promise<number> {
  for (const { slug, ...data } of SEED_LISTINGS) {
    await prisma.serviceListing.upsert({ where: { slug }, create: { slug, ...data }, update: data });
  }
  return SEED_LISTINGS.length;
}
