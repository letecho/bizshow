import type { PrismaClient } from '@prisma/client';
import { DATA_SOURCES } from './dataSources';
import { SEED_LISTINGS } from './seedData';

/** シードデータを slug をキーに upsert する（何度実行しても同じ結果） */
export async function seed(prisma: PrismaClient): Promise<number> {
  for (const { slug, ...data } of SEED_LISTINGS) {
    await prisma.serviceListing.upsert({ where: { slug }, create: { slug, ...data }, update: data });
  }
  // 収集元は作成時のみ無効で登録し、管理者が変えた isEnabled は上書きしない
  for (const { id, ...data } of DATA_SOURCES) {
    await prisma.dataSource.upsert({ where: { id }, create: { id, ...data, isEnabled: false }, update: data });
  }
  return SEED_LISTINGS.length;
}
