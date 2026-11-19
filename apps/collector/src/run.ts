import {
  CandidateExtractSchema,
  classifyEntity,
  hasTargetLanguageEvidence,
  isEntityInScope,
  scoreCandidate,
  type CandidateExtract,
  type CollectorConfig,
  type EntityClassification,
} from '@fss/shared';
import type { CorporateNumberClient } from './match/corporateNumber';
import { Matcher } from './match/matcher';
import type { CollectedRecord, CollectorRepository, DataSourceRecord, RunCounts, RunResult, SourceAdapter } from './types';
const ERROR_SAMPLE_MAX = 500;
const ERROR_SAMPLE_ITEMS = 3;

export interface RunCollectionOptions {
  source: DataSourceRecord;
  adapter: SourceAdapter;
  config: CollectorConfig;
  repo: CollectorRepository;
  options?: { file?: string };
  /** CORPORATE_NUMBER_API_ID 設定時のみ（F-114） */
  corporateNumberClient?: CorporateNumberClient;
  now?: () => Date;
}

interface Pending {
  record: CollectedRecord;
  extracted: CandidateExtract;
  entity: EntityClassification;
  hasTargetLanguage: boolean;
}

/**
 * 1 ソースを収集して掲載候補を保存し、CollectionRun に結果を残す。
 * 対象外（カテゴリ・都道府県・事業者の種類・対象言語）の候補は保存しない。ServiceListing は作らない。
 */
export async function runCollection({
  source,
  adapter,
  config,
  repo,
  options = {},
  corporateNumberClient,
  now = () => new Date(),
}: RunCollectionOptions): Promise<RunResult> {
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
    const records = await adapter.collect({ source, config, now: startedAt, options });
    counts.fetchedCount = records.length;

    const eligible: Pending[] = [];
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
        sourceEntityType: record.sourceEntityType,
      });
      // 種類を判定できない候補は、法人番号の照会で法人と確認できる可能性があるため照会まで残す
      const canBeRescued = Boolean(corporateNumberClient) && entity.entityType === 'unknown';
      if (!isEntityInScope(entity.entityType, config.entityScope) && !canBeRescued) {
        counts.skippedByEntityCount += 1;
        continue;
      }

      const hasTargetLanguage = hasTargetLanguageEvidence(record.languageEvidence, config.targetLanguages);
      if (config.targetLanguageMode === 'require' && !hasTargetLanguage) {
        counts.skippedByLanguageCount += 1;
        continue;
      }
      eligible.push({ record, extracted, entity, hasTargetLanguage });
    }

    // 対象言語の根拠がある候補を先に保存し、上限を超えた分は次回に回す（sort は安定）
    eligible.sort((a, b) => Number(b.hasTargetLanguage) - Number(a.hasTargetLanguage));
    const matcher = new Matcher(await repo.loadMatchTargets(), config.matchNameThreshold);
    let attempted = 0;
    let lookupFailed = false;

    for (const [i, item] of eligible.entries()) {
      if (attempted >= config.maxCandidatesPerRun) {
        counts.skippedByLimitCount = eligible.length - i;
        break;
      }
      const { record, extracted } = item;
      const name = extracted.name.ja ?? extracted.name.en ?? '';
      let { entity } = item;
      let corporateNumber = extracted.corporateNumber;
      let closedCorporation = false;

      if (corporateNumberClient) {
        try {
          const hit = await corporateNumberClient.lookup({
            name,
            prefecture: extracted.prefecture,
            address: extracted.address?.ja ?? extracted.address?.en,
          });
          if (hit) {
            corporateNumber = hit.corporateNumber;
            closedCorporation = hit.closed;
            entity = classifyEntity({
              name,
              sourceOwnerType: record.sourceOwnerType,
              sourceEntityType: record.sourceEntityType,
              verifiedCorporateNumber: hit.corporateNumber,
            });
          }
        } catch (err) {
          // 照会の失敗で収集全体は止めない（法人番号なしとして続ける）
          if (!lookupFailed) errors.unshift((err as Error).message);
          lookupFailed = true;
        }
        if (!isEntityInScope(entity.entityType, config.entityScope)) {
          counts.skippedByEntityCount += 1;
          continue;
        }
      }

      const match = matcher.match({ sourceId: source.id, sourceRecordId: record.sourceRecordId, extracted, corporateNumber });
      const outcome = await repo.upsertCandidate({
        sourceId: source.id,
        sourceRecordId: record.sourceRecordId,
        sourceUrl: record.sourceUrl,
        rawKey: record.rawKey,
        fetchedAt: startedAt,
        extracted,
        languageEvidence: record.languageEvidence,
        hasTargetLanguage: item.hasTargetLanguage,
        entityType: entity.entityType,
        entityEvidence: entity.entityEvidence,
        corporateNumber,
        matchType: match.matchType,
        matchedListingId: match.matchedListingId,
        score: scoreCandidate({
          sourceKind: source.kind,
          extracted,
          languageEvidence: record.languageEvidence,
          targetLanguages: config.targetLanguages,
          matchedOtherSource: match.matchedOtherSource,
          closedCorporation,
        }),
      });
      attempted += 1;
      if (outcome !== 'kept') counts.candidateCount += 1;
      // 同じ実行内の重複も検出できるように照合の相手に加える
      matcher.add({
        kind: 'candidate',
        id: `${source.id}/${record.sourceRecordId}`,
        sourceId: source.id,
        sourceRecordId: record.sourceRecordId,
        names: [extracted.name.ja, extracted.name.en].filter((n): n is string => Boolean(n)),
        prefecture: extracted.prefecture,
        phone: extracted.phone,
        address: extracted.address?.ja ?? extracted.address?.en,
        corporateNumber,
      });
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
