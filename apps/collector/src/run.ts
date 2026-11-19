import {
  CandidateExtractSchema,
  classifyEntity,
  hasTargetLanguageEvidence,
  isEntityInScope,
  type CollectorConfig,
} from '@fss/shared';
import type { CandidateInput, CollectorRepository, DataSourceRecord, RunCounts, RunResult, SourceAdapter } from './types';

/** prioritize で対象言語の根拠がある候補に加える点数（本格的なスコアは F-114） */
export const TARGET_LANGUAGE_SCORE_BONUS = 10;
const ERROR_SAMPLE_MAX = 500;
const ERROR_SAMPLE_ITEMS = 3;

export interface RunCollectionOptions {
  source: DataSourceRecord;
  adapter: SourceAdapter;
  config: CollectorConfig;
  repo: CollectorRepository;
  now?: () => Date;
}

/**
 * 1 ソースを収集して掲載候補を保存し、CollectionRun に結果を残す。
 * 対象外（カテゴリ・都道府県・事業者の種類・対象言語）の候補は保存しない。ServiceListing は作らない。
 */
export async function runCollection({ source, adapter, config, repo, now = () => new Date() }: RunCollectionOptions): Promise<RunResult> {
  const startedAt = now();
  const runId = await repo.startRun(source.id, startedAt);
  const counts: RunCounts = {
    fetchedCount: 0,
    candidateCount: 0,
    skippedByLimitCount: 0,
    skippedByLanguageCount: 0,
    skippedByEntityCount: 0,
    errorCount: 0,
  };
  const errors: string[] = [];
  let result: RunResult;

  try {
    const records = await adapter.collect({ source, config, now: startedAt });
    counts.fetchedCount = records.length;

    const eligible: CandidateInput[] = [];
    for (const record of records) {
      const parsed = CandidateExtractSchema.safeParse(record.extracted);
      if (!parsed.success) {
        counts.errorCount += 1;
        // 収集した値は含めず、レコード ID と項目名だけを残す
        errors.push(`${record.sourceRecordId}: ${[...new Set(parsed.error.issues.map((i) => i.path.join('.') || '(root)'))].join(',')}`);
        continue;
      }
      const extracted = parsed.data;
      if (!config.categories.includes(extracted.category) || !config.prefectures.includes(extracted.prefecture)) continue;

      const entity = classifyEntity({
        name: extracted.name.ja ?? extracted.name.en ?? '',
        sourceOwnerType: record.sourceOwnerType,
      });
      if (!isEntityInScope(entity.entityType, config.entityScope)) {
        counts.skippedByEntityCount += 1;
        continue;
      }

      const hasTargetLanguage = hasTargetLanguageEvidence(record.languageEvidence, config.targetLanguages);
      if (config.targetLanguageMode === 'require' && !hasTargetLanguage) {
        counts.skippedByLanguageCount += 1;
        continue;
      }

      eligible.push({
        sourceId: source.id,
        sourceRecordId: record.sourceRecordId,
        sourceUrl: record.sourceUrl,
        rawKey: record.rawKey,
        fetchedAt: startedAt,
        extracted,
        languageEvidence: record.languageEvidence,
        hasTargetLanguage,
        entityType: entity.entityType,
        entityEvidence: entity.entityEvidence,
        corporateNumber: extracted.corporateNumber,
        matchType: 'new',
        score: hasTargetLanguage ? TARGET_LANGUAGE_SCORE_BONUS : 0,
      });
    }

    // 対象言語の根拠がある候補を先に保存し、上限を超えた分は次回に回す（sort は安定）
    eligible.sort((a, b) => Number(b.hasTargetLanguage) - Number(a.hasTargetLanguage));
    const toSave = eligible.slice(0, config.maxCandidatesPerRun);
    counts.skippedByLimitCount = eligible.length - toSave.length;

    for (const candidate of toSave) {
      const outcome = await repo.upsertCandidate(candidate);
      if (outcome !== 'kept') counts.candidateCount += 1;
    }
    result = { status: 'succeeded', ...counts, errorSample: sample(errors, counts.errorCount) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result = { status: 'failed', ...counts, errorSample: sample([message, ...errors], counts.errorCount + 1) };
  }

  await repo.finishRun(runId, now(), result);
  return result;
}

function sample(errors: string[], total: number): string | undefined {
  if (errors.length === 0) return undefined;
  const head = errors.slice(0, ERROR_SAMPLE_ITEMS).join(' / ');
  const more = total > ERROR_SAMPLE_ITEMS ? ` (+${total - ERROR_SAMPLE_ITEMS} more)` : '';
  return `${head}${more}`.slice(0, ERROR_SAMPLE_MAX);
}
