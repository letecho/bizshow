import type { Prisma } from '@prisma/client';

/**
 * 収集元の初期データ（F-112）。id は apps/collector のアダプター名と一致させる。
 * isEnabled は作成時のみ false（管理者が有効化する）。シードの再実行で上書きしない。
 */
export const DATA_SOURCES: (Omit<Prisma.DataSourceCreateInput, 'isEnabled'> & { id: string })[] = [
  {
    id: 'mhlw-medical',
    kind: 'open_data',
    name: '医療情報ネット（厚生労働省）オープンデータ',
    url: 'https://www.iryou.teikyouseido.mhlw.go.jp/',
    license: 'CC BY 4.0',
    attribution: '出典: 医療情報ネット（厚生労働省）のデータを加工して作成',
    schedule: 'monthly',
  },
];
