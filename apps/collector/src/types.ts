import type {
  CandidateExtract,
  CandidateMatchType,
  CollectionRunStatus,
  CollectorConfig,
  DataSourceKind,
  EntityEvidence,
  EntityType,
  LanguageEvidence,
} from '@fss/shared';

/** 収集元（DataSource テーブルの行） */
export interface DataSourceRecord {
  id: string;
  kind: DataSourceKind;
  name: string;
  url: string;
  isEnabled: boolean;
}

/** アダプターが返す 1 件分のレコード（検証前） */
export interface CollectedRecord {
  /** 収集元でのレコード ID（再実行で重複させないキー） */
  sourceRecordId: string;
  sourceUrl?: string;
  rawKey?: string;
  /** CandidateExtractSchema で検証する。人名などスキーマに無い項目は捨てられる */
  extracted: unknown;
  languageEvidence: LanguageEvidence[];
  /** 事業者の種類の判定材料（ソースの開設者種別など） */
  sourceOwnerType?: string | null;
  /** ソースの対応表で sourceOwnerType から決めた事業者の種類 */
  sourceEntityType?: EntityType | null;
}

export interface AdapterContext {
  source: DataSourceRecord;
  config: CollectorConfig;
  now: Date;
  /** CLI のオプション（例: --file でローカルの入力ファイルを指定） */
  options: { file?: string };
}

/** 収集元ごとの処理（fetch → extract）。DataSource.id と同じ名前で sources/index.ts に登録する */
export interface SourceAdapter {
  id: string;
  collect(ctx: AdapterContext): Promise<CollectedRecord[]>;
}

/** 保存する候補 */
export interface CandidateInput {
  sourceId: string;
  sourceRecordId: string;
  sourceUrl?: string;
  rawKey?: string;
  fetchedAt: Date;
  extracted: CandidateExtract;
  languageEvidence: LanguageEvidence[];
  hasTargetLanguage: boolean;
  entityType: EntityType;
  entityEvidence: EntityEvidence[];
  corporateNumber?: string;
  matchType: CandidateMatchType;
  score: number;
}

export interface RunCounts {
  fetchedCount: number;
  candidateCount: number;
  skippedByLimitCount: number;
  skippedByLanguageCount: number;
  skippedByEntityCount: number;
  errorCount: number;
}

export interface RunResult extends RunCounts {
  status: Exclude<CollectionRunStatus, 'running'>;
  errorSample?: string;
}

/**
 * 永続化の境界。保存は (sourceId, sourceRecordId) の upsert。
 * 既にレビュー済み（pending 以外）の候補は上書きしない。
 */
export interface CollectorRepository {
  findSource(id: string): Promise<DataSourceRecord | null>;
  startRun(sourceId: string, startedAt: Date): Promise<string>;
  finishRun(runId: string, finishedAt: Date, result: RunResult): Promise<void>;
  upsertCandidate(input: CandidateInput): Promise<'created' | 'updated' | 'kept'>;
}
