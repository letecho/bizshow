import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { loadCollectorConfig } from '@fss/shared';
import { runCollection } from '../../run';
import { createMemoryRepository } from '../../testing';
import type { DataSourceRecord } from '../../types';
import defaultMapping from './mapping.json';
import { createMhlwMedicalAdapter, normalizePhone, normalizePrefecture, MHLW_MEDICAL_SOURCE_ID } from './index';

const fixtures = join(__dirname, '__fixtures__');
const source: DataSourceRecord = {
  id: MHLW_MEDICAL_SOURCE_ID,
  kind: 'open_data',
  name: '医療情報ネット',
  url: 'https://www.mhlw.go.jp/',
  isEnabled: true,
};

async function collect(
  opts: { env?: Record<string, string>; file?: string; mapping?: unknown; mem?: ReturnType<typeof createMemoryRepository> } = {},
) {
  const mem = opts.mem ?? createMemoryRepository([source]);
  const result = await runCollection({
    source,
    adapter: createMhlwMedicalAdapter(opts.mapping),
    config: loadCollectorConfig(opts.env ?? {}),
    repo: mem.repo,
    options: { file: join(fixtures, opts.file ?? 'sample.zip') },
  });
  const get = (id: string) => mem.candidates.get(`${MHLW_MEDICAL_SOURCE_ID}/${id}`);
  return { result, mem, get };
}

describe('mhlw-medical normalizers (F-112)', () => {
  it('converts prefecture codes and names to PREFECTURES codes', () => {
    expect(normalizePrefecture('13')).toBe('tokyo');
    expect(normalizePrefecture('01')).toBe('hokkaido');
    expect(normalizePrefecture('1')).toBe('hokkaido');
    expect(normalizePrefecture('４７')).toBe('okinawa');
    expect(normalizePrefecture('東京都')).toBe('tokyo');
    expect(normalizePrefecture('Osaka')).toBe('osaka');
    expect(normalizePrefecture('99')).toBeUndefined();
    expect(normalizePrefecture('')).toBeUndefined();
  });

  it('keeps only digits and + in phone numbers', () => {
    expect(normalizePhone('03-0000-0001')).toBe('0300000001');
    expect(normalizePhone('(052) 000-0009 内線 123')).toBe('0520000009123');
    expect(normalizePhone('+81-92-000-0010')).toBe('+81920000010');
    expect(normalizePhone('０３－１２３４－５６７８')).toBe('0312345678');
    expect(normalizePhone('不明')).toBeUndefined();
  });
});

describe('mhlw-medical adapter (F-112)', () => {
  it('creates normalized medical candidates from the sample ZIP', async () => {
    const { result, mem, get } = await collect();
    expect(result).toMatchObject({
      status: 'succeeded',
      fetchedCount: 10,
      // 個人開設（F0003）と種類を判定できない（F0006）は保存しない
      skippedByEntityCount: 2,
      // 都道府県コードが不正（F0008）
      errorCount: 1,
      errorSample: 'F0008: prefecture',
      candidateCount: 7,
    });
    expect([...mem.candidates.keys()].map((k) => k.split('/')[1]).sort()).toEqual([
      'F0001',
      'F0002',
      'F0004',
      'F0005',
      'F0007',
      'F0009',
      'F0010',
    ]);
    expect(get('F0001')!.extracted).toEqual({
      category: 'medical',
      prefecture: 'tokyo',
      name: { ja: '医療法人社団 架空会 さくら架空クリニック', en: 'Sakura Kaku Clinic' },
      address: { ja: '東京都架空区架空町1-1' },
      phone: '0300000001',
      websiteUrl: 'https://example.com/sakura',
      supportedLanguages: ['en', 'vi'],
    });
    expect(get('F0002')!.extracted).toMatchObject({ prefecture: 'osaka', phone: '0600000002' });
    expect(get('F0005')!.extracted).toMatchObject({ prefecture: 'hokkaido' });
    // スキームの無い URL は採用しない
    expect(get('F0005')!.extracted.websiteUrl).toBeUndefined();
    expect(get('F0009')!.extracted).toMatchObject({ prefecture: 'aichi', phone: '0520000009123', supportedLanguages: [] });
    expect(get('F0010')!.extracted.phone).toBe('+81920000010');
  });

  it('records foreign-language columns as evidence and marks vi as the target language', async () => {
    const { get } = await collect();
    const sakura = get('F0001')!;
    expect(sakura.languageEvidence).toEqual([
      { lang: 'en', kind: 'open_data', value: '対応することができる外国語の種類: 英語' },
      { lang: 'vi', kind: 'open_data', value: '対応することができる外国語の種類: ベトナム語' },
    ]);
    expect(sakura.hasTargetLanguage).toBe(true);
    // open_data 40 + 必須項目 30 + 対象言語 20（F-114）
    expect(sakura.score).toBe(90);
    expect(get('F0007')!.hasTargetLanguage).toBe(true);
    // en のみは根拠ありだが対象言語ではない
    expect(get('F0002')!).toMatchObject({ hasTargetLanguage: false, score: 80 });
  });

  it('leaves supportedLanguages empty and lowers the score when there is no foreign-language value', async () => {
    const { get } = await collect();
    // 空欄（F0004）・対応表に無い言語のみ（F0010）
    for (const id of ['F0004', 'F0010']) {
      expect(get(id)!).toMatchObject({ languageEvidence: [], hasTargetLanguage: false, score: 70 });
      expect(get(id)!.extracted.supportedLanguages).toEqual([]);
    }
    // 列そのものが無い mapping
    const noColumn = { ...defaultMapping, columns: { ...defaultMapping.columns, foreignLanguages: null } };
    const { get: get2 } = await collect({ mapping: noColumn });
    expect(get2('F0001')!).toMatchObject({ languageEvidence: [], score: 70 });
    expect(get2('F0001')!.extracted.supportedLanguages).toEqual([]);
  });

  it('classifies entities with the owner-type table and does not read personal-name columns', async () => {
    const { mem, get } = await collect();
    expect(get('F0001')!.entityType).toBe('corporation');
    // 根拠はすべて記録し、開設者種別（ソースの項目）を最優先にする
    expect(get('F0001')!.entityEvidence).toEqual([
      { kind: 'source_field', value: '医療法人' },
      { kind: 'name_suffix', value: '医療法人' },
    ]);
    expect(get('F0002')!.entityType).toBe('public');
    // 名称の法人格表記（独立行政法人）より開設者種別の対応表（public）を優先
    expect(get('F0004')!.entityType).toBe('public');
    expect(get('F0004')!.entityEvidence[0]).toEqual({ kind: 'source_field', value: '独立行政法人' });
    // 開設者種別が空なら名称の法人格表記で判定
    expect(get('F0007')!).toMatchObject({ entityType: 'corporation', entityEvidence: [{ kind: 'name_suffix', value: '株式会社' }] });
    expect(get('F0003')).toBeUndefined();
    const stored = JSON.stringify([...mem.candidates.values()]);
    expect(stored).not.toMatch(/架空 (太郎|花子|次郎|三郎|五郎|七郎|八郎)|山田 架空/);
    expect(stored).not.toContain('管理者氏名');
    expect(JSON.stringify(mem.runs)).not.toContain('やまだ架空医院');
  });

  it('reads a CSV with different column names and encoding by changing mapping.json only', async () => {
    const renamed = {
      ...defaultMapping,
      encoding: 'shift_jis',
      columns: {
        id: '施設ID',
        name: '医療機関名称',
        nameEn: null,
        prefecture: '都道府県',
        city: null,
        address: '所在地住所',
        phone: '電話',
        websiteUrl: 'ホームページ',
        foreignLanguages: '外国語対応',
        ownerType: '開設者区分',
      },
    };
    const { result, get } = await collect({ file: 'sample-renamed-sjis.zip', mapping: renamed });
    expect(result).toMatchObject({ status: 'succeeded', fetchedCount: 2, candidateCount: 2, errorCount: 0 });
    expect(get('R1')!.extracted).toMatchObject({
      prefecture: 'tokyo',
      name: { ja: '医療法人 架空会 架空内科' },
      phone: '0311110001',
      supportedLanguages: ['vi', 'en'],
    });
    expect(get('R1')!.hasTargetLanguage).toBe(true);
    expect(get('R2')!).toMatchObject({ entityType: 'public', extracted: { prefecture: 'osaka' } });
    expect(JSON.stringify(get('R1'))).not.toContain('架空 院長');
  });

  it('fails the run with the missing column names when the CSV does not match mapping.json', async () => {
    const { result } = await collect({ file: 'sample-renamed-sjis.zip' });
    expect(result.status).toBe('failed');
    expect(result.errorSample).toContain('missing column(s) ID, 正式名称, 都道府県コード');
  });

  it('does not save rows outside COLLECTOR_PREFECTURES or when medical is not a target category', async () => {
    const { mem } = await collect({ env: { COLLECTOR_PREFECTURES: 'tokyo' } });
    expect([...mem.candidates.keys()].map((k) => k.split('/')[1]).sort()).toEqual(['F0001', 'F0004']);
    const { result, mem: mem2 } = await collect({ env: { COLLECTOR_CATEGORIES: 'legal' } });
    expect(mem2.candidates.size).toBe(0);
    expect(result.candidateCount).toBe(0);
  });

  it('does not duplicate candidates on re-run', async () => {
    const { mem } = await collect();
    await collect({ mem });
    expect(mem.candidates.size).toBe(7);
    expect(mem.runs).toHaveLength(2);
  });

  it('requires --file while no download URL is configured', async () => {
    const mem = createMemoryRepository([source]);
    const result = await runCollection({
      source,
      adapter: createMhlwMedicalAdapter(),
      config: loadCollectorConfig({}),
      repo: mem.repo,
    });
    expect(result).toMatchObject({ status: 'failed' });
    expect(result.errorSample).toContain('--file');
  });

  it('rejects an invalid mapping.json', () => {
    expect(() => createMhlwMedicalAdapter({ ...defaultMapping, columns: { ...defaultMapping.columns, id: '' } })).toThrow();
    expect(() => createMhlwMedicalAdapter({ ...defaultMapping, zipUrl: 'http://insecure.example.com/a.zip' })).toThrow();
  });
});
