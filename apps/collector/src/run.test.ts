import { describe, it, expect, vi } from 'vitest';
import { loadCollectorConfig } from '@fss/shared';
import { runCollection } from './run';
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
    expect(a).toMatchObject({ entityType: 'corporation', hasTargetLanguage: true, matchType: 'new', score: 40 + 15 + 20, status: 'pending' });
    expect(a.extracted).not.toHaveProperty('director');
    // open_data 40 + 必須項目 2/4（名称・都道府県）15 + 言語の根拠なし 0
    expect(candidates.get('test-source/b')!.score).toBe(55);
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

describe('runCollection matching and scoring (F-114)', () => {
  const listing = { kind: 'listing' as const, id: 'L1', names: ['既存クリニック'], prefecture: 'tokyo', phone: '03-1234-5678', address: null, corporateNumber: '1234567890123' };

  function withPhone(id: string, phone: string, name = `医療法人 ${id}`): CollectedRecord {
    const r = record(id, { name });
    return { ...r, extracted: { ...(r.extracted as object), phone } };
  }

  it('sets matchType update and matchedListingId for a known phone number', async () => {
    const mem = createMemoryRepository([source], [listing]);
    const { candidates } = await run([withPhone('a', '+81 3 1234 5678'), withPhone('b', '03-0000-0000')], {}, mem);
    expect(candidates.get('test-source/a')).toMatchObject({ matchType: 'update', matchedListingId: 'L1' });
    expect(candidates.get('test-source/b')).toMatchObject({ matchType: 'new' });
    expect(candidates.get('test-source/b')!.matchedListingId).toBeUndefined();
  });

  it('marks duplicates within the same run', async () => {
    const { candidates } = await run([withPhone('a', '03-5555-5555'), withPhone('b', '0355555555')]);
    expect(candidates.get('test-source/a')!.matchType).toBe('new');
    expect(candidates.get('test-source/b')!.matchType).toBe('duplicate');
  });

  it('does not look up corporate numbers without a client (CORPORATE_NUMBER_API_ID unset)', async () => {
    const { result } = await run([record('a')]);
    expect(result.status).toBe('succeeded');
  });

  it('uses corporate number lookups: rescues unknown entities, matches by number and zeroes closed corporations', async () => {
    const mem = createMemoryRepository([source], [listing]);
    const lookup = vi.fn(async ({ name }: { name: string }) => {
      if (name === 'さくらクリニック') return { corporateNumber: '9999999999999', closed: false };
      if (name === '既存と違う名前') return { corporateNumber: '1234567890123', closed: false };
      if (name === '医療法人 閉鎖') return { corporateNumber: '8888888888888', closed: true };
      return null;
    });
    const result = await runCollection({
      source,
      adapter: adapter([
        record('unknown', { name: 'さくらクリニック' }),
        record('renamed', { name: '既存と違う名前' }),
        record('closed', { name: '医療法人 閉鎖' }),
        record('stillUnknown', { name: 'ひまわり' }),
      ]),
      config: loadCollectorConfig({}),
      repo: mem.repo,
      corporateNumberClient: { lookup },
    });
    // 法人格表記が無くても法人番号が見つかれば corporation
    expect(mem.candidates.get('test-source/unknown')).toMatchObject({
      entityType: 'corporation',
      corporateNumber: '9999999999999',
      entityEvidence: [{ kind: 'corporate_number', value: '9999999999999' }],
    });
    // 法人番号が一致すれば名称が違っても update
    expect(mem.candidates.get('test-source/renamed')).toMatchObject({ matchType: 'update', matchedListingId: 'L1' });
    expect(mem.candidates.get('test-source/closed')!.score).toBe(0);
    // 見つからなければ既存の判定のまま（unknown は保存しない）
    expect(mem.candidates.has('test-source/stillUnknown')).toBe(false);
    expect(result.skippedByEntityCount).toBe(1);
    expect(lookup).toHaveBeenCalledTimes(4);
  });

  it('continues without corporate numbers when the lookup fails', async () => {
    const mem = createMemoryRepository([source]);
    const result = await runCollection({
      source,
      adapter: adapter([record('a'), record('b')]),
      config: loadCollectorConfig({}),
      repo: mem.repo,
      corporateNumberClient: { lookup: async () => Promise.reject(new Error('corporate number lookup failed: HTTP 503')) },
    });
    expect(result).toMatchObject({ status: 'succeeded', candidateCount: 2 });
    expect(result.errorSample).toBe('corporate number lookup failed: HTTP 503');
  });

  it('scores vi evidence higher than en-only evidence under the same conditions', async () => {
    const en: CollectedRecord = { ...record('en'), languageEvidence: [{ lang: 'en', kind: 'source_field', value: '英語' }] };
    const { candidates } = await run([en, record('vi', { vi: true })]);
    expect(candidates.get('test-source/vi')!.score).toBeGreaterThan(candidates.get('test-source/en')!.score);
  });
});

describe('runCollection blocklist (F-116)', () => {
  const withSite = (id: string, websiteUrl: string, corporateNumber?: string): CollectedRecord => {
    const r = record(id);
    return { ...r, extracted: { ...(r.extracted as object), websiteUrl, ...(corporateNumber && { corporateNumber }) } };
  };

  it('does not create candidates for blocked domains (including subdomains) or corporate numbers', async () => {
    const mem = createMemoryRepository([source], [], [
      { domain: 'blocked.example', corporateNumber: null },
      { domain: null, corporateNumber: '1111111111111' },
    ]);
    const { result, candidates } = await run(
      [
        withSite('domain', 'https://blocked.example/'),
        withSite('subdomain', 'https://www.blocked.example/clinic'),
        withSite('corp', 'https://ok.example/', '1111111111111'),
        withSite('lookalike', 'https://notblocked.example/'),
        record('noSite'),
      ],
      {},
      mem,
    );
    expect([...candidates.keys()].sort()).toEqual(['test-source/lookalike', 'test-source/noSite']);
    expect(result).toMatchObject({ status: 'succeeded', fetchedCount: 5, candidateCount: 2 });
  });

  it('also checks corporate numbers found by the lookup', async () => {
    const mem = createMemoryRepository([source], [], [{ domain: null, corporateNumber: '2222222222222' }]);
    await runCollection({
      source,
      adapter: adapter([record('a')]),
      config: loadCollectorConfig({}),
      repo: mem.repo,
      corporateNumberClient: { lookup: async () => ({ corporateNumber: '2222222222222', closed: false }) },
    });
    expect(mem.candidates.size).toBe(0);
  });
});
