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
export function createMemoryRepository(sources: DataSourceRecord[]) {
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
  };
  return { repo, candidates, runs };
}
