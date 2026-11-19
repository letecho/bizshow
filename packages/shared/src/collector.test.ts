import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  CandidateExtractSchema,
  CollectorConfigError,
  PREFECTURES,
  SERVICE_CATEGORIES,
  classifyEntity,
  hasTargetLanguageEvidence,
  languageEvidenceScore,
  websiteOnlyLanguages,
  isEntityInScope,
  loadCollectorConfig,
  loadStaleDays,
  loadEntityScope,
  diffCandidate,
  CandidateListQuerySchema,
  type CandidateExtract,
} from './index';

describe('loadCollectorConfig (F-111)', () => {
  it('loads POC defaults when nothing is set', () => {
    const c = loadCollectorConfig({});
    expect(c.categories).toEqual([...SERVICE_CATEGORIES]);
    expect(c.prefectures).toHaveLength(PREFECTURES.length);
    expect(c.entityScope).toBe('corporate_public');
    expect(c.targetLanguages).toEqual(['vi']);
    expect(c.targetLanguageMode).toBe('prioritize');
    expect(c.maxCandidatesPerRun).toBe(100);
    expect(c.crawl).toEqual({
      enabled: false,
      maxSitesPerRun: 20,
      maxPages: 3,
      intervalSec: 10,
      recrawlDays: 30,
      userAgent: 'bizshow-collector/0.1 (+http://localhost:3000/bot)',
    });
    expect(c.llm).toEqual({ enabled: false, monthlyBudgetJpy: 0, model: undefined, priceInPerMTokJpy: 500, priceOutPerMTokJpy: 2500, apiKey: undefined });
    expect(c.corporateNumberApiId).toBeUndefined();
    expect(c.matchNameThreshold).toBe(0.8);
    expect(c.staleDays).toBe(180);
    expect(c.raw).toEqual({ retentionDays: 30, dir: 'collector-raw' });
  });

  it('treats empty strings as unset and builds the UA from WEB_BASE_URL', () => {
    const c = loadCollectorConfig({ COLLECTOR_CATEGORIES: '', COLLECTOR_MAX_CANDIDATES_PER_RUN: '', WEB_BASE_URL: 'https://example.jp/' });
    expect(c.categories).toHaveLength(SERVICE_CATEGORIES.length);
    expect(c.maxCandidatesPerRun).toBe(100);
    expect(c.crawl.userAgent).toBe('bizshow-collector/0.1 (+https://example.jp/bot)');
  });

  it('parses explicit values', () => {
    const c = loadCollectorConfig({
      COLLECTOR_CATEGORIES: 'legal, medical',
      COLLECTOR_PREFECTURES: 'tokyo,osaka',
      COLLECTOR_ENTITY_SCOPE: 'corporate',
      COLLECTOR_TARGET_LANGUAGES: 'vi,en',
      COLLECTOR_TARGET_LANGUAGE_MODE: 'require',
      COLLECTOR_MAX_CANDIDATES_PER_RUN: '500',
      COLLECTOR_CRAWL_ENABLED: 'true',
      COLLECTOR_CRAWL_INTERVAL_SEC: '5',
      COLLECTOR_LLM_MONTHLY_BUDGET_JPY: '3000',
      COLLECTOR_LLM_MODEL: 'some-model',
      COLLECTOR_USER_AGENT: 'custom-ua',
    });
    expect(c.categories).toEqual(['legal', 'medical']);
    expect(c.prefectures).toEqual(['tokyo', 'osaka']);
    expect(c.entityScope).toBe('corporate');
    expect(c.targetLanguages).toEqual(['vi', 'en']);
    expect(c.targetLanguageMode).toBe('require');
    expect(c.maxCandidatesPerRun).toBe(500);
    expect(c.crawl.enabled).toBe(true);
    expect(c.crawl.intervalSec).toBe(5);
    expect(c.crawl.userAgent).toBe('custom-ua');
    expect(c.llm).toMatchObject({ enabled: false, monthlyBudgetJpy: 3000, model: 'some-model' });
  });

  it.each([
    ['unknown category', { COLLECTOR_CATEGORIES: 'legal,food' }],
    ['unknown prefecture', { COLLECTOR_PREFECTURES: 'atlantis' }],
    ['unknown language', { COLLECTOR_TARGET_LANGUAGES: 'fr' }],
    ['ja only target language', { COLLECTOR_TARGET_LANGUAGES: 'ja' }],
    ['unknown entity scope', { COLLECTOR_ENTITY_SCOPE: 'everyone' }],
    ['unknown language mode', { COLLECTOR_TARGET_LANGUAGE_MODE: 'only' }],
    ['crawl interval below 5', { COLLECTOR_CRAWL_INTERVAL_SEC: '4' }],
    ['negative budget', { COLLECTOR_LLM_MONTHLY_BUDGET_JPY: '-1' }],
    ['zero candidate limit', { COLLECTOR_MAX_CANDIDATES_PER_RUN: '0' }],
    ['negative site limit', { COLLECTOR_CRAWL_MAX_SITES_PER_RUN: '-3' }],
    ['zero page limit', { COLLECTOR_CRAWL_MAX_PAGES: '0' }],
    ['non numeric limit', { COLLECTOR_MAX_CANDIDATES_PER_RUN: 'many' }],
    ['non boolean flag', { COLLECTOR_CRAWL_ENABLED: 'yes' }],
    ['threshold above 1', { COLLECTOR_MATCH_NAME_THRESHOLD: '1.5' }],
  ])('rejects %s at startup', (_label, env) => {
    expect(() => loadCollectorConfig(env)).toThrow(CollectorConfigError);
  });
});

describe('classifyEntity (F-111)', () => {
  it('classifies corporations by the legal-entity suffix in the name', () => {
    expect(classifyEntity({ name: '医療法人社団 さくら会 さくらクリニック' })).toEqual({
      entityType: 'corporation',
      entityEvidence: [{ kind: 'name_suffix', value: '医療法人' }],
    });
    expect(classifyEntity({ name: 'ABC 株式会社' }).entityType).toBe('corporation');
    expect(classifyEntity({ name: '㈱サンプル' }).entityEvidence).toEqual([{ kind: 'name_suffix', value: '(株)' }]);
    expect(classifyEntity({ name: '（一社）国際交流ネット' }).entityType).toBe('corporation');
    expect(classifyEntity({ name: 'NPO法人 多文化共生' }).entityType).toBe('corporation');
    expect(classifyEntity({ name: 'Tokyo Support Co., Ltd.' }).entityType).toBe('corporation');
  });

  it('prefers the source owner-type field', () => {
    expect(classifyEntity({ name: 'さくらクリニック', sourceOwnerType: '個人' })).toEqual({
      entityType: 'individual',
      entityEvidence: [{ kind: 'source_field', value: '個人' }],
    });
    expect(classifyEntity({ name: '中央病院', sourceOwnerType: '都道府県' }).entityType).toBe('public');
    expect(classifyEntity({ name: '中央病院', sourceOwnerType: '市町村' }).entityType).toBe('public');
    expect(classifyEntity({ name: 'さくら病院', sourceOwnerType: '医療法人' }).entityType).toBe('corporation');
    // 開設者が個人なら、名称に法人格らしき語があっても個人
    expect(classifyEntity({ name: '株式会社前のクリニック', sourceOwnerType: '個人' }).entityType).toBe('individual');
  });

  it('uses the entity type mapped by the source over the heuristics', () => {
    expect(classifyEntity({ name: '中央病院', sourceOwnerType: '独立行政法人', sourceEntityType: 'public' })).toEqual({
      entityType: 'public',
      entityEvidence: [{ kind: 'source_field', value: '独立行政法人' }],
    });
  });

  it('uses a verified corporate number', () => {
    expect(classifyEntity({ name: 'さくら', verifiedCorporateNumber: '1234567890123' })).toEqual({
      entityType: 'corporation',
      entityEvidence: [{ kind: 'corporate_number', value: '1234567890123' }],
    });
  });

  it('classifies public organizations from the public list', () => {
    expect(classifyEntity({ name: '東京出入国在留管理局' })).toMatchObject({
      entityType: 'public',
      entityEvidence: [{ kind: 'public_list', value: '出入国在留管理局' }],
    });
    expect(classifyEntity({ name: '新宿区役所' }).entityType).toBe('public');
    expect(classifyEntity({ name: 'ハローワーク新宿' }).entityType).toBe('public');
    expect(classifyEntity({ name: '都立広尾病院' }).entityType).toBe('public');
  });

  it('returns unknown when nothing identifies the entity', () => {
    expect(classifyEntity({ name: 'さくらクリニック' })).toEqual({ entityType: 'unknown', entityEvidence: [] });
    expect(classifyEntity({ name: '山田行政書士事務所', sourceOwnerType: 'その他' })).toEqual({
      entityType: 'unknown',
      entityEvidence: [],
    });
  });

  it('checks the entity scope', () => {
    expect(isEntityInScope('corporation', 'corporate_public')).toBe(true);
    expect(isEntityInScope('public', 'corporate_public')).toBe(true);
    expect(isEntityInScope('individual', 'corporate_public')).toBe(false);
    expect(isEntityInScope('unknown', 'corporate_public')).toBe(false);
    expect(isEntityInScope('public', 'corporate')).toBe(false);
    expect(isEntityInScope('unknown', 'all')).toBe(true);
  });
});

describe('CandidateExtractSchema (F-111)', () => {
  it('has no fields for personal names or personal e-mail addresses', () => {
    expectTypeOf<keyof CandidateExtract>().toEqualTypeOf<
      | 'category'
      | 'prefecture'
      | 'city'
      | 'supportedLanguages'
      | 'name'
      | 'description'
      | 'address'
      | 'phone'
      | 'websiteUrl'
      | 'corporateNumber'
    >();
    const parsed = CandidateExtractSchema.parse({
      category: 'medical',
      prefecture: 'tokyo',
      name: { ja: 'さくら病院' },
      representative: '山田太郎',
      director: '山田花子',
      email: 'taro@example.com',
    });
    expect(Object.keys(parsed)).not.toEqual(expect.arrayContaining(['representative']));
    expect(parsed).not.toHaveProperty('director');
    expect(parsed).not.toHaveProperty('email');
    expect(parsed.supportedLanguages).toEqual([]);
  });

  it('requires a ja or en name and valid fields', () => {
    expect(CandidateExtractSchema.safeParse({ category: 'medical', prefecture: 'tokyo', name: { vi: 'x' } }).success).toBe(false);
    expect(CandidateExtractSchema.safeParse({ category: 'food', prefecture: 'tokyo', name: { ja: 'x' } }).success).toBe(false);
    expect(
      CandidateExtractSchema.safeParse({ category: 'medical', prefecture: 'tokyo', name: { ja: 'x' }, websiteUrl: 'javascript:alert(1)' })
        .success,
    ).toBe(false);
  });

  it('detects target-language evidence', () => {
    expect(hasTargetLanguageEvidence([{ lang: 'vi', kind: 'source_field', value: 'ベトナム語' }], ['vi'])).toBe(true);
    expect(hasTargetLanguageEvidence([{ lang: 'en', kind: 'source_field', value: '英語' }], ['vi'])).toBe(false);
    expect(hasTargetLanguageEvidence([], ['vi'])).toBe(false);
  });

  it('lists languages whose only evidence is the official website (F-115)', () => {
    expect(
      websiteOnlyLanguages([
        { lang: 'en', kind: 'open_data', value: '英語' },
        { lang: 'en', kind: 'website', value: 'https://a.example/en/', signal: 'hreflang' },
        { lang: 'vi', kind: 'website', value: 'https://a.example/vi/', signal: 'switch_link' },
      ]),
    ).toEqual(['vi']);
    expect(websiteOnlyLanguages([{ lang: 'en', kind: 'open_data', value: '英語' }])).toEqual([]);
  });

  it('scores language evidence (target 20 / other foreign 10 / none 0)', () => {
    expect(languageEvidenceScore([{ lang: 'vi', kind: 'website', value: 'u' }], ['vi'])).toBe(20);
    expect(languageEvidenceScore([{ lang: 'en', kind: 'website', value: 'u' }], ['vi'])).toBe(10);
    expect(languageEvidenceScore([{ lang: 'ja', kind: 'website', value: 'u' }], ['vi'])).toBe(0);
  });
});

describe('matching normalizers (F-114)', () => {
  it('treats phone number notations as the same number', async () => {
    const { normalizePhoneForMatch } = await import('./collector');
    const expected = '0312345678';
    for (const p of ['03-1234-5678', '0312345678', '+81 3 1234 5678', '+81-(0)3-1234-5678', '０３（１２３４）５６７８']) {
      expect(normalizePhoneForMatch(p)).toBe(expected);
    }
    expect(normalizePhoneForMatch('03-1234-5679')).not.toBe(expected);
    expect(normalizePhoneForMatch('')).toBeUndefined();
    expect(normalizePhoneForMatch('12')).toBeUndefined();
  });

  it('treats address notations (full-width digits, 丁目, hyphens, spaces, prefecture) as the same address', async () => {
    const { normalizeAddressForMatch } = await import('./collector');
    const expected = normalizeAddressForMatch('東京都新宿区西新宿2-8-1');
    expect(expected).toBe('新宿区西新宿2-8-1');
    for (const a of ['東京都新宿区西新宿２丁目８番１号', '新宿区西新宿2丁目8-1', '東京都 新宿区 西新宿 2－8－1', '東京都新宿区西新宿２ー８ー１', '東京都新宿区西新宿2‐8‐1']) {
      expect(normalizeAddressForMatch(a)).toBe(expected);
    }
    expect(normalizeAddressForMatch('東京都新宿区西新宿2-8-2')).not.toBe(expected);
    // 数字に挟まれていない長音記号（センター等）は変えない
    expect(normalizeAddressForMatch('新宿区センター1-1')).toBe('新宿区センター1-1');
  });

  it('computes name similarity ignoring legal-entity notations', async () => {
    const { nameSimilarity } = await import('./collector');
    expect(nameSimilarity('医療法人社団 さくら会 さくらクリニック', 'さくら会さくらクリニック')).toBe(1);
    expect(nameSimilarity('株式会社サンプル', '(株)サンプル')).toBe(1);
    expect(nameSimilarity('さくらクリニック新宿', 'さくらクリニック')).toBeGreaterThanOrEqual(0.8);
    expect(nameSimilarity('さくらクリニック', 'ひまわり歯科')).toBeLessThan(0.3);
  });
});

describe('scoreCandidate (F-114)', () => {
  const full = { name: { ja: 'x' }, address: { ja: 'y' }, phone: '0300000000', prefecture: 'tokyo' as const };
  const vi = [{ lang: 'vi' as const, kind: 'open_data', value: 'v' }];
  const en = [{ lang: 'en' as const, kind: 'open_data', value: 'e' }];
  const base = { targetLanguages: ['vi' as const], matchedOtherSource: false };

  it('adds source reliability, required fields, language evidence and multi-source agreement', async () => {
    const { scoreCandidate } = await import('./collector');
    expect(scoreCandidate({ ...base, sourceKind: 'open_data', extracted: full, languageEvidence: vi, matchedOtherSource: true })).toBe(100);
    expect(scoreCandidate({ ...base, sourceKind: 'open_data', extracted: full, languageEvidence: vi })).toBe(90);
    expect(scoreCandidate({ ...base, sourceKind: 'partner', extracted: full, languageEvidence: en })).toBe(80);
    expect(scoreCandidate({ ...base, sourceKind: 'crawl', extracted: full, languageEvidence: [] })).toBe(50);
    expect(scoreCandidate({ ...base, sourceKind: 'api', extracted: full, languageEvidence: [] })).toBe(60);
  });

  it('scores required fields proportionally (boundaries 0..4 fields)', async () => {
    const { scoreCandidate } = await import('./collector');
    const s = (extracted: Record<string, unknown>) =>
      scoreCandidate({ ...base, sourceKind: 'crawl', extracted: extracted as never, languageEvidence: [] }) - 20;
    expect(s({})).toBe(0);
    expect(s({ prefecture: 'tokyo' })).toBe(8);
    expect(s({ prefecture: 'tokyo', name: { ja: 'x' } })).toBe(15);
    expect(s({ prefecture: 'tokyo', name: { ja: 'x' }, phone: '0300000000' })).toBe(23);
    expect(s(full)).toBe(30);
  });

  it('scores target-language evidence higher than other languages only, and ignores ja', async () => {
    const { scoreCandidate } = await import('./collector');
    const s = (languageEvidence: { lang: 'ja' | 'en' | 'vi'; kind: string; value: string }[]) =>
      scoreCandidate({ ...base, sourceKind: 'open_data', extracted: full, languageEvidence });
    expect(s(vi)).toBeGreaterThan(s(en));
    expect(s([...en, ...vi])).toBe(90);
    expect(s(en)).toBe(80);
    expect(s([{ lang: 'ja', kind: 'open_data', value: 'j' }])).toBe(70);
  });

  it('returns 0 for a closed corporation', async () => {
    const { scoreCandidate } = await import('./collector');
    expect(scoreCandidate({ ...base, sourceKind: 'open_data', extracted: full, languageEvidence: vi, closedCorporation: true })).toBe(0);
  });
});

describe('loadStaleDays (F-116)', () => {
  it('reads COLLECTOR_STALE_DAYS with the default 180 and rejects invalid values', () => {
    expect(loadStaleDays({})).toBe(180);
    expect(loadStaleDays({ COLLECTOR_STALE_DAYS: '30' })).toBe(30);
    // 他の収集設定が不正でも影響を受けない
    expect(loadStaleDays({ COLLECTOR_STALE_DAYS: '30', COLLECTOR_CATEGORIES: 'nope' })).toBe(30);
    expect(() => loadStaleDays({ COLLECTOR_STALE_DAYS: '0' })).toThrow(CollectorConfigError);
  });
});

describe('candidate review helpers (F-113)', () => {
  it('reads COLLECTOR_ENTITY_SCOPE alone with the default corporate_public', () => {
    expect(loadEntityScope({})).toBe('corporate_public');
    expect(loadEntityScope({ COLLECTOR_ENTITY_SCOPE: 'all', COLLECTOR_CATEGORIES: 'nope' })).toBe('all');
    expect(() => loadEntityScope({ COLLECTOR_ENTITY_SCOPE: 'everyone' })).toThrow(CollectorConfigError);
  });

  it('parses the candidate list query with defaults', () => {
    expect(CandidateListQuerySchema.parse({})).toEqual({ status: 'pending', page: 1, limit: 50 });
    expect(CandidateListQuerySchema.parse({ targetLang: '1', minScore: '70', category: '' })).toMatchObject({ targetLang: true, minScore: 70 });
    expect(CandidateListQuerySchema.safeParse({ status: 'deleted' }).success).toBe(false);
  });

  it('diffs only the fields the candidate has and that differ', () => {
    const listing = {
      category: 'medical',
      prefecture: 'tokyo',
      city: null,
      supportedLanguages: ['en', 'ja'],
      name: { en: 'Clinic', ja: 'クリニック' },
      description: { en: 'd' },
      address: null,
      phone: '03-0000-0000',
      websiteUrl: null,
    } as never;
    const diff = diffCandidate(
      {
        category: 'medical',
        prefecture: 'tokyo',
        supportedLanguages: ['ja', 'en'],
        name: { ja: 'クリニック' },
        description: { en: 'changed' },
        phone: '03-1111-1111',
        websiteUrl: 'https://example.com/',
      },
      listing,
    );
    expect(diff).toEqual([
      { field: 'description', current: { en: 'd' }, candidate: { en: 'changed' } },
      { field: 'phone', current: '03-0000-0000', candidate: '03-1111-1111' },
      { field: 'websiteUrl', current: null, candidate: 'https://example.com/' },
    ]);
  });
});
