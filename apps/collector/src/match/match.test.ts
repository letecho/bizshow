import { describe, it, expect, vi } from 'vitest';
import { loadCollectorConfig, type CandidateExtract } from '@fss/shared';
import { Matcher, type MatchTarget } from './matcher';
import { corporateNumberClientFromConfig, createNtaCorporateNumberClient, parseNtaResponse, pickCorporation } from './corporateNumber';

const listing: MatchTarget = {
  kind: 'listing',
  id: 'L1',
  names: ['さくらクリニック', 'Sakura Clinic'],
  prefecture: 'tokyo',
  phone: '03-1234-5678',
  address: '東京都新宿区西新宿2-8-1',
  corporateNumber: '1234567890123',
};

function subject(e: Partial<CandidateExtract>, extra: { sourceId?: string; id?: string; corporateNumber?: string } = {}) {
  return {
    sourceId: extra.sourceId ?? 'src-a',
    sourceRecordId: extra.id ?? 'r1',
    corporateNumber: extra.corporateNumber,
    extracted: { category: 'medical', prefecture: 'tokyo', supportedLanguages: [], name: { ja: '別の名前' }, ...e } as CandidateExtract,
  };
}

describe('Matcher (F-114)', () => {
  const m = () => new Matcher([listing], 0.8);

  it('matches phone numbers written differently as the same listing', () => {
    for (const phone of ['03-1234-5678', '0312345678', '+81 3 1234 5678']) {
      expect(m().match(subject({ phone }))).toEqual({ matchType: 'update', matchedListingId: 'L1', matchedOtherSource: false });
    }
  });

  it('matches address variants when the name is similar enough', () => {
    for (const address of ['東京都新宿区西新宿２丁目８番１号', '新宿区西新宿2-8-1', '東京都新宿区西新宿２－８－１']) {
      expect(m().match(subject({ name: { ja: '医療法人社団 さくらクリニック' }, address: { ja: address } })).matchType).toBe('update');
    }
    // 住所が同じでも名称が違えば別の事業者（同じビルの別の施設）
    expect(m().match(subject({ name: { ja: 'ひまわり歯科' }, address: { ja: '新宿区西新宿2-8-1' } })).matchType).toBe('new');
    // 名称が似ていても都道府県が違えば一致しない
    expect(m().match(subject({ prefecture: 'osaka', name: { ja: 'さくらクリニック' }, address: { ja: '新宿区西新宿2-8-1' } })).matchType).toBe('new');
  });

  it('respects COLLECTOR_MATCH_NAME_THRESHOLD', () => {
    const s = subject({ name: { ja: 'さくら内科クリニック' }, address: { ja: '新宿区西新宿2-8-1' } });
    expect(new Matcher([listing], 0.5).match(s).matchType).toBe('update');
    expect(new Matcher([listing], 0.99).match(s).matchType).toBe('new');
  });

  it('treats a matching corporate number as an update even if the name differs', () => {
    expect(m().match(subject({ name: { ja: '全く違う名称' } }, { corporateNumber: '1234567890123' }))).toMatchObject({
      matchType: 'update',
      matchedListingId: 'L1',
    });
  });

  it('marks duplicates of pending candidates and detects agreement across sources', () => {
    const other: MatchTarget = { kind: 'candidate', id: 'C1', sourceId: 'src-b', sourceRecordId: 'x', names: ['ひまわり'], prefecture: 'tokyo', phone: '06-1111-2222' };
    const self: MatchTarget = { ...other, id: 'C2', sourceId: 'src-a', sourceRecordId: 'r1', phone: '09-9999-9999' };
    const matcher = new Matcher([other, self], 0.8);
    expect(matcher.match(subject({ phone: '0611112222' }))).toEqual({ matchType: 'duplicate', matchedOtherSource: true });
    // 自分自身（同じ sourceId・sourceRecordId）とは照合しない
    expect(matcher.match(subject({ phone: '09-9999-9999' }))).toEqual({ matchType: 'new', matchedOtherSource: false });
  });
});

const xml = (rows: { no: string; name: string; close?: string; city?: string; street?: string }[]) =>
  `<?xml version="1.0" encoding="UTF-8"?><corporations><count>${rows.length}</count>${rows
    .map(
      (r) =>
        `<corporation><sequenceNumber>1</sequenceNumber><corporateNumber>${r.no}</corporateNumber><name>${r.name}</name><prefectureName>東京都</prefectureName><cityName>${r.city ?? '新宿区'}</cityName><streetNumber>${r.street ?? '西新宿2-8-1'}</streetNumber><closeDate>${r.close ?? ''}</closeDate></corporation>`,
    )
    .join('')}</corporations>`;

describe('corporate number lookup (F-114)', () => {
  it('parses the NTA Web-API XML and picks a single same-name corporation', () => {
    const hits = parseNtaResponse(xml([{ no: '1111111111111', name: '医療法人社団さくら会' }]));
    expect(hits).toEqual([{ corporateNumber: '1111111111111', name: '医療法人社団さくら会', closeDate: '', address: '東京都新宿区西新宿2-8-1' }]);
    expect(pickCorporation(hits, { name: '医療法人社団 さくら会', prefecture: 'tokyo' })).toEqual({ corporateNumber: '1111111111111', closed: false });
    expect(pickCorporation(hits, { name: 'ひまわり会', prefecture: 'tokyo' })).toBeNull();
  });

  it('uses the address to choose among same-name corporations, otherwise gives up', () => {
    const hits = parseNtaResponse(
      xml([
        { no: '1111111111111', name: '株式会社サンプル', street: '西新宿2-8-1' },
        { no: '2222222222222', name: '株式会社サンプル', city: '渋谷区', street: '道玄坂1-1' },
      ]),
    );
    expect(pickCorporation(hits, { name: '株式会社サンプル', prefecture: 'tokyo', address: '東京都渋谷区道玄坂1丁目1番' })).toEqual({
      corporateNumber: '2222222222222',
      closed: false,
    });
    expect(pickCorporation(hits, { name: '株式会社サンプル', prefecture: 'tokyo' })).toBeNull();
  });

  it('reports closed corporations', () => {
    const hits = parseNtaResponse(xml([{ no: '3333333333333', name: '株式会社閉鎖', close: '2020-03-31' }]));
    expect(pickCorporation(hits, { name: '株式会社閉鎖', prefecture: 'tokyo' })).toEqual({ corporateNumber: '3333333333333', closed: true });
  });

  it('calls the API with the prefecture code and never exposes the application ID in errors', async () => {
    const fetchImpl = vi.fn(async () => new Response(xml([{ no: '1111111111111', name: '株式会社サンプル' }]), { status: 200 }));
    const client = createNtaCorporateNumberClient('SECRET-ID', { userAgent: 'ua', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await client.lookup({ name: '株式会社サンプル', prefecture: 'tokyo' })).toEqual({ corporateNumber: '1111111111111', closed: false });
    const url = new URL((fetchImpl.mock.calls[0] as unknown as [string])[0]);
    expect(url.origin + url.pathname).toBe('https://api.houjin-bangou.nta.go.jp/4/name');
    expect(url.searchParams.get('address')).toBe('13');
    expect(url.searchParams.get('close')).toBe('1');

    const failing = createNtaCorporateNumberClient('SECRET-ID', {
      userAgent: 'ua',
      fetchImpl: (async () => new Response('', { status: 403 })) as unknown as typeof fetch,
    });
    await expect(failing.lookup({ name: 'x', prefecture: 'tokyo' })).rejects.toThrow(/^corporate number lookup failed: HTTP 403$/);
  });

  it('does not create a client (no lookups) without CORPORATE_NUMBER_API_ID', () => {
    const fetchImpl = vi.fn();
    expect(corporateNumberClientFromConfig(loadCollectorConfig({}), fetchImpl as unknown as typeof fetch)).toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(corporateNumberClientFromConfig(loadCollectorConfig({ CORPORATE_NUMBER_API_ID: 'id' }))).toBeDefined();
  });
});
