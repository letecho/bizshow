import { describe, it, expect } from 'vitest';
import { loadCollectorConfig } from '@fss/shared';
import { runCollection, TARGET_LANGUAGE_SCORE_BONUS } from './run';
import { createMemoryRepository } from './testing';
import type { CollectedRecord, DataSourceRecord, SourceAdapter } from './types';

const source: DataSourceRecord = { id: 'test-source', kind: 'open_data', name: 'Test', url: 'https://example.com', isEnabled: true };

function record(id: string, overrides: Partial<{ category: string; prefecture: string; name: string; vi: boolean; owner: string }> = {}): CollectedRecord {
  return {
    sourceRecordId: id,
    sourceUrl: `https://example.com/${id}`,
    extracted: {
      category: overrides.category ?? 'medical',
      prefecture: overrides.prefecture ?? 'tokyo',
      name: { ja: overrides.name ?? `医療法人 ${id} クリニック` },
      supportedLanguages: overrides.vi ? ['ja', 'vi'] : ['ja'],
      // ソースにある人名の列はスキーマで捨てられる
      director: '山田太郎',
    },
    languageEvidence: overrides.vi ? [{ lang: 'vi', kind: 'source_field', value: '外国語対応: ベトナム語' }] : [],
    sourceOwnerType: overrides.owner,
  };
}

function adapter(records: CollectedRecord[] | (() => Promise<CollectedRecord[]>)): SourceAdapter {
  return { id: source.id, collect: typeof records === 'function' ? records : async () => records };
}

async function run(records: CollectedRecord[], env: Record<string, string> = {}, mem = createMemoryRepository([source])) {
  const result = await runCollection({ source, adapter: adapter(records), config: loadCollectorConfig(env), repo: mem.repo });
  return { result, ...mem, mem };
}

describe('runCollection (F-111)', () => {
  it('saves valid candidates without personal names and records the run', async () => {
    const { result, candidates, runs } = await run([record('a', { vi: true }), record('b')]);
    expect(result).toEqual({
      status: 'succeeded',
      fetchedCount: 2,
      candidateCount: 2,
      skippedByLimitCount: 0,
      skippedByLanguageCount: 0,
      skippedByEntityCount: 0,
      errorCount: 0,
      errorSample: undefined,
    });
    const a = candidates.get('test-source/a')!;
    expect(a).toMatchObject({ entityType: 'corporation', hasTargetLanguage: true, matchType: 'new', score: TARGET_LANGUAGE_SCORE_BONUS, status: 'pending' });
    expect(a.extracted).not.toHaveProperty('director');
    expect(candidates.get('test-source/b')!.score).toBe(0);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ sourceId: 'test-source', status: 'succeeded', result: { candidateCount: 2 } });
    expect(runs[0].finishedAt).toBeInstanceOf(Date);
  });

  it('does not save individual or unknown entities by default and keeps only the count', async () => {
    const { result, candidates, runs } = await run([
      record('corp'),
      record('indiv', { owner: '個人' }),
      record('unknown', { name: 'さくらクリニック' }),
      record('public', { name: '都立中央病院' }),
    ]);
    expect([...candidates.keys()].sort()).toEqual(['test-source/corp', 'test-source/public']);
    expect(result.skippedByEntityCount).toBe(2);
    // 対象外の内容（名称など）は実行履歴に残さない
    expect(JSON.stringify(runs)).not.toContain('さくらクリニック');
  });

  it('saves individuals only when COLLECTOR_ENTITY_SCOPE=all', async () => {
    const { candidates } = await run([record('indiv', { owner: '個人' })], { COLLECTOR_ENTITY_SCOPE: 'all' });
    expect(candidates.get('test-source/indiv')!.entityType).toBe('individual');
  });

  it('does not save candidates outside COLLECTOR_CATEGORIES / COLLECTOR_PREFECTURES', async () => {
    const { candidates, result } = await run(
      [record('legal', { category: 'legal' }), record('medical'), record('osaka-legal', { category: 'legal', prefecture: 'osaka' })],
      { COLLECTOR_CATEGORIES: 'legal', COLLECTOR_PREFECTURES: 'tokyo' },
    );
    expect([...candidates.keys()]).toEqual(['test-source/legal']);
    expect(result.candidateCount).toBe(1);
  });

  it('saves target-language candidates first when the limit is reached (prioritize)', async () => {
    const { candidates, result } = await run([record('plain1'), record('plain2'), record('vi1', { vi: true })], {
      COLLECTOR_MAX_CANDIDATES_PER_RUN: '2',
    });
    expect([...candidates.keys()].sort()).toEqual(['test-source/plain1', 'test-source/vi1']);
    expect(result.skippedByLimitCount).toBe(1);
  });

  it('skips candidates without target-language evidence in require mode', async () => {
    const { candidates, result } = await run([record('plain'), record('vi', { vi: true })], {
      COLLECTOR_TARGET_LANGUAGE_MODE: 'require',
    });
    expect([...candidates.keys()]).toEqual(['test-source/vi']);
    expect(result.skippedByLanguageCount).toBe(1);
  });

  it('stops at COLLECTOR_MAX_CANDIDATES_PER_RUN and counts the rest', async () => {
    const { candidates, result } = await run([record('1'), record('2'), record('3'), record('4')], {
      COLLECTOR_MAX_CANDIDATES_PER_RUN: '2',
    });
    expect(candidates.size).toBe(2);
    expect(result).toMatchObject({ candidateCount: 2, skippedByLimitCount: 2 });
  });

  it('does not duplicate candidates with the same sourceRecordId on re-run and keeps reviewed ones', async () => {
    const mem = createMemoryRepository([source]);
    await run([record('a'), record('b')], {}, mem);
    mem.candidates.get('test-source/b')!.status = 'approved';
    const second = await run([record('a'), record('b')], {}, mem);
    expect(mem.candidates.size).toBe(2);
    expect(mem.candidates.get('test-source/b')!.status).toBe('approved');
    expect(second.result.candidateCount).toBe(1);
    expect(mem.runs).toHaveLength(2);
  });

  it('counts invalid records as errors without saving them or their contents', async () => {
    const bad: CollectedRecord = { ...record('bad'), extracted: { category: 'food', prefecture: 'tokyo', name: { ja: '秘密の名前' } } };
    const { candidates, result } = await run([bad, record('ok')]);
    expect(candidates.size).toBe(1);
    expect(result.errorCount).toBe(1);
    expect(result.errorSample).toBe('bad: category');
    expect(result.errorSample).not.toContain('秘密の名前');
  });

  it('records a failed run when the adapter throws', async () => {
    const mem = createMemoryRepository([source]);
    const result = await runCollection({
      source,
      adapter: adapter(async () => {
        throw new Error('download failed: 503');
      }),
      config: loadCollectorConfig({}),
      repo: mem.repo,
    });
    expect(result).toMatchObject({ status: 'failed', fetchedCount: 0, candidateCount: 0, errorSample: 'download failed: 503' });
    expect(mem.runs[0]).toMatchObject({ status: 'failed' });
  });
});
