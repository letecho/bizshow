import type { PrismaClient } from '@prisma/client';
import { INITIAL_CATEGORIES } from '@fss/shared';
import { DATA_SOURCES } from './dataSources';
import { SEED_LISTINGS } from './seedData';

/** シードデータを slug をキーに upsert する（何度実行しても同じ結果） */
export async function seed(prisma: PrismaClient): Promise<number> {
  // 初期カテゴリ（マイグレーションでも投入済み）。既存の行は変えない
  for (const [sortOrder, { code, name }] of INITIAL_CATEGORIES.entries()) {
    await prisma.category.upsert({ where: { code }, create: { code, name, sortOrder }, update: {} });
  }
  for (const { slug, ...data } of SEED_LISTINGS) {
    await prisma.serviceListing.upsert({ where: { slug }, create: { slug, ...data }, update: data });
  }
  // 収集元は作成時のみ無効で登録し、管理者が変えた isEnabled は上書きしない
  for (const { id, ...data } of DATA_SOURCES) {
    await prisma.dataSource.upsert({ where: { id }, create: { id, ...data, isEnabled: false }, update: data });
  }
  return SEED_LISTINGS.length;
}
