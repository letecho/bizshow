import type { CrawlBlockEntry } from '@fss/shared';
import type { MatchTarget } from './match/matcher';
import type { CandidateInput, CollectorRepository, DataSourceRecord, RunResult } from './types';

export interface StoredCandidate extends CandidateInput {
  status: 'pending' | 'approved' | 'rejected' | 'on_hold';
}

export interface StoredRun {
  id: string;
  sourceId: string;
  startedAt: Date;
  finishedAt?: Date;
  status: 'running' | RunResult['status'];
  result?: RunResult;
}

/** テスト用のメモリ上のリポジトリ（Prisma 実装と同じ upsert 規則） */
export function createMemoryRepository(
  sources: DataSourceRecord[],
  listings: MatchTarget[] = [],
  blocklist: Pick<CrawlBlockEntry, 'domain' | 'corporateNumber'>[] = [],
) {
  const candidates = new Map<string, StoredCandidate>();
  const runs: StoredRun[] = [];
  const repo: CollectorRepository = {
    async findSource(id) {
      return sources.find((s) => s.id === id) ?? null;
    },
    async startRun(sourceId, startedAt) {
      const id = `run${runs.length + 1}`;
      runs.push({ id, sourceId, startedAt, status: 'running' });
      return id;
    },
    async finishRun(runId, finishedAt, result) {
      const run = runs.find((r) => r.id === runId);
      if (!run) throw new Error(`no run ${runId}`);
      Object.assign(run, { finishedAt, status: result.status, result });
    },
    async upsertCandidate(input) {
      const key = `${input.sourceId}/${input.sourceRecordId}`;
      const existing = candidates.get(key);
      if (!existing) {
        candidates.set(key, { ...input, status: 'pending' });
        return 'created';
      }
      if (existing.status !== 'pending') return 'kept';
      candidates.set(key, { ...input, status: 'pending' });
      return 'updated';
    },
    async loadBlocklist() {
      return blocklist;
    },
    async loadCrawlTargets() {
      return [...candidates.entries()]
        .filter(([, c]) => c.status === 'pending' && c.extracted.websiteUrl)
        .map(([key, c]) => ({
          id: key,
          websiteUrl: c.extracted.websiteUrl!,
          languageEvidence: c.languageEvidence,
          hasTargetLanguage: c.hasTargetLanguage,
          score: c.score,
          createdAt: c.fetchedAt,
        }));
    },
    async updateCandidateLanguageEvidence(id, update) {
      const c = candidates.get(id);
      if (!c || c.status !== 'pending') return false;
      candidates.set(id, { ...c, ...update });
      return true;
    },
    async loadMatchTargets() {
      const pending = [...candidates.values()].filter((c) => c.status === 'pending');
      return [
        ...listings,
        ...pending.map((c) => ({
          kind: 'candidate' as const,
          id: `${c.sourceId}/${c.sourceRecordId}`,
          sourceId: c.sourceId,
          sourceRecordId: c.sourceRecordId,
          names: [c.extracted.name.ja, c.extracted.name.en].filter((n): n is string => Boolean(n)),
          prefecture: c.extracted.prefecture,
          phone: c.extracted.phone,
          address: c.extracted.address?.ja ?? c.extracted.address?.en,
          corporateNumber: c.corporateNumber,
        })),
      ];
    },
  };
  return { repo, candidates, runs };
}
