import type { SourceAdapter } from '../types';
import { createMhlwMedicalAdapter, MHLW_MEDICAL_SOURCE_ID } from './mhlw-medical';

/**
 * 収集元アダプターの登録。キーは DataSource.id（apps/api/src/db/seed.ts の DATA_SOURCES と一致させる）。
 */
export const sourceAdapters: Record<string, SourceAdapter> = {
  [MHLW_MEDICAL_SOURCE_ID]: createMhlwMedicalAdapter(),
};
