import { z } from 'zod';
import {
  AdminServiceInputSchema,
  LISTING_TEXT_MAX,
  PREFECTURES,
  SERVICE_CATEGORIES,
  SUPPORTED_LOCALES,
  type AdminService,
  type PrefectureCode,
  type ServiceCategory,
  type SupportedLocale,
} from './domain';
import { LlmEnvSchema, type LlmSettings } from './llm';

// データ収集基盤（F-111）: 設定パラメータ・事業者の種類の判定・抽出結果のスキーマ

// ---- 列挙値 ------------------------------------------------------------------

export const DATA_SOURCE_KINDS = ['open_data', 'api', 'crawl', 'partner'] as const;
export type DataSourceKind = (typeof DATA_SOURCE_KINDS)[number];

export const COLLECTION_RUN_STATUSES = ['running', 'succeeded', 'failed'] as const;
export type CollectionRunStatus = (typeof COLLECTION_RUN_STATUSES)[number];

export const CANDIDATE_STATUSES = ['pending', 'approved', 'rejected', 'on_hold'] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export const CANDIDATE_MATCH_TYPES = ['new', 'update', 'duplicate'] as const;
export type CandidateMatchType = (typeof CANDIDATE_MATCH_TYPES)[number];

/** 事業者の種類 */
export const ENTITY_TYPES = ['corporation', 'public', 'individual', 'unknown'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

/** 事業者の種類の判定根拠 */
/** admin_review: 承認時に管理者が種類を変更した根拠（F-113）、consent: 個人事業主の掲載への本人の同意の記録（F-119） */
export const ENTITY_EVIDENCE_KINDS = ['source_field', 'corporate_number', 'name_suffix', 'public_list', 'admin_review', 'consent'] as const;
export type EntityEvidenceKind = (typeof ENTITY_EVIDENCE_KINDS)[number];

/** 収集する事業者の種類（COLLECTOR_ENTITY_SCOPE） */
export const ENTITY_SCOPES = ['corporate_public', 'corporate', 'all'] as const;
export type EntityScope = (typeof ENTITY_SCOPES)[number];

/** 対象言語の扱い（COLLECTOR_TARGET_LANGUAGE_MODE） */
export const TARGET_LANGUAGE_MODES = ['prioritize', 'require'] as const;
export type TargetLanguageMode = (typeof TARGET_LANGUAGE_MODES)[number];

/** 重点対象にできる言語（ja 以外） */
export const COLLECTOR_TARGET_LOCALES = SUPPORTED_LOCALES.filter(
  (l): l is Exclude<SupportedLocale, 'ja'> => l !== 'ja',
);

/** 同一ドメインへのアクセス間隔の下限（秒）。サイトへの負荷のため設定で下げられない */
export const CRAWL_INTERVAL_MIN_SEC = 5;

// ---- 設定パラメータ ------------------------------------------------------------

const PREFECTURE_CODES = PREFECTURES.map((p) => p.code) as PrefectureCode[];
const DEFAULT_WEB_BASE_URL = 'http://localhost:3000';

/** 空文字は未設定扱い（.env に `KEY=` と書いたときに既定値を使う） */
const unsetIfEmpty = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

/** `all` またはカンマ区切りのリスト。`all` は候補すべてに展開する */
function listOrAll<T extends string>(allowed: readonly T[], fallback: string, name: string) {
  return z.preprocess(
    unsetIfEmpty,
    z
      .string()
      .default(fallback)
      .transform((raw, ctx): T[] => {
        const items = [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))];
        if (items.length === 1 && items[0] === 'all') return [...allowed];
        const unknown = items.filter((i) => !(allowed as readonly string[]).includes(i));
        if (items.length === 0 || unknown.length > 0) {
          ctx.addIssue({ code: 'custom', message: `${name}: unknown value(s) ${unknown.join(', ') || '(empty)'}` });
          return z.NEVER;
        }
        return items as T[];
      }),
  );
}

const bool = (fallback: boolean) =>
  z.preprocess(unsetIfEmpty, z.enum(['true', 'false']).default(fallback ? 'true' : 'false')).transform((v) => v === 'true');

const int = (fallback: number, min: number) =>
  z.preprocess(unsetIfEmpty, z.coerce.number().int().min(min).default(fallback));

const optionalString = z.preprocess(unsetIfEmpty, z.string().trim().optional());

const CollectorEnvSchema = z.object({
  COLLECTOR_CATEGORIES: listOrAll<ServiceCategory>(SERVICE_CATEGORIES, 'all', 'COLLECTOR_CATEGORIES'),
  COLLECTOR_PREFECTURES: listOrAll<PrefectureCode>(PREFECTURE_CODES, 'all', 'COLLECTOR_PREFECTURES'),
  COLLECTOR_ENTITY_SCOPE: z.preprocess(unsetIfEmpty, z.enum(ENTITY_SCOPES).default('corporate_public')),
  COLLECTOR_TARGET_LANGUAGES: z.preprocess(
    unsetIfEmpty,
    z
      .string()
      .default('vi')
      .transform((raw, ctx) => {
        const items = [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))];
        const invalid = items.filter((i) => !(COLLECTOR_TARGET_LOCALES as readonly string[]).includes(i));
        if (items.length === 0 || invalid.length > 0) {
          ctx.addIssue({
            code: 'custom',
            message: `COLLECTOR_TARGET_LANGUAGES: must be ${COLLECTOR_TARGET_LOCALES.join('/')} (got ${invalid.join(', ') || '(empty)'})`,
          });
          return z.NEVER;
        }
        return items as Exclude<SupportedLocale, 'ja'>[];
      }),
  ),
  COLLECTOR_TARGET_LANGUAGE_MODE: z.preprocess(unsetIfEmpty, z.enum(TARGET_LANGUAGE_MODES).default('prioritize')),
  COLLECTOR_MAX_CANDIDATES_PER_RUN: int(100, 1),
  COLLECTOR_CRAWL_ENABLED: bool(false),
  COLLECTOR_CRAWL_MAX_SITES_PER_RUN: int(20, 1),
  COLLECTOR_CRAWL_MAX_PAGES: int(3, 1),
  COLLECTOR_CRAWL_INTERVAL_SEC: int(10, CRAWL_INTERVAL_MIN_SEC),
  COLLECTOR_RECRAWL_DAYS: int(30, 1),
  COLLECTOR_USER_AGENT: optionalString,
  ...LlmEnvSchema.shape,
  CORPORATE_NUMBER_API_ID: optionalString,
  COLLECTOR_MATCH_NAME_THRESHOLD: z.preprocess(unsetIfEmpty, z.coerce.number().min(0).max(1).default(0.8)),
  COLLECTOR_STALE_DAYS: int(180, 1),
  COLLECTOR_RAW_RETENTION_DAYS: int(30, 1),
  COLLECTOR_RAW_DIR: z.preprocess(unsetIfEmpty, z.string().trim().default('collector-raw')),
  WEB_BASE_URL: z.preprocess(unsetIfEmpty, z.string().trim().default(DEFAULT_WEB_BASE_URL)),
});

export interface CollectorConfig {
  categories: ServiceCategory[];
  prefectures: PrefectureCode[];
  entityScope: EntityScope;
  targetLanguages: Exclude<SupportedLocale, 'ja'>[];
  targetLanguageMode: TargetLanguageMode;
  maxCandidatesPerRun: number;
  crawl: {
    enabled: boolean;
    maxSitesPerRun: number;
    maxPages: number;
    intervalSec: number;
    recrawlDays: number;
    userAgent: string;
  };
  /** LLM（F-117）。isLlmAvailable で利用可否を判定する */
  llm: LlmSettings;
  corporateNumberApiId?: string;
  matchNameThreshold: number;
  staleDays: number;
  raw: { retentionDays: number; dir: string };
}

/** 設定値の検証エラー（起動時に投げる） */
export class CollectorConfigError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid collector config:\n- ${issues.join('\n- ')}`);
    this.name = 'CollectorConfigError';
  }
}

/** COLLECTOR_ENTITY_SCOPE だけを読む（API の候補承認用。他の収集設定の不正で API を止めない） */
export function loadEntityScope(env: Record<string, string | undefined>): EntityScope {
  const parsed = CollectorEnvSchema.shape.COLLECTOR_ENTITY_SCOPE.safeParse(env.COLLECTOR_ENTITY_SCOPE);
  if (!parsed.success) throw new CollectorConfigError([`COLLECTOR_ENTITY_SCOPE: ${parsed.error.issues[0]?.message}`]);
  return parsed.data;
}

/** COLLECTOR_STALE_DAYS だけを読む（API の /admin?stale=1 用。他の収集設定の不正で API を止めない） */
export function loadStaleDays(env: Record<string, string | undefined>): number {
  const parsed = CollectorEnvSchema.shape.COLLECTOR_STALE_DAYS.safeParse(env.COLLECTOR_STALE_DAYS);
  if (!parsed.success) throw new CollectorConfigError([`COLLECTOR_STALE_DAYS: ${parsed.error.issues[0]?.message}`]);
  return parsed.data;
}

/** 環境変数から収集の設定を読む。不正値は CollectorConfigError */
export function loadCollectorConfig(env: Record<string, string | undefined>): CollectorConfig {
  const parsed = CollectorEnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new CollectorConfigError(parsed.error.issues.map((i) => `${i.path.join('.') || '(env)'}: ${i.message}`));
  }
  const e = parsed.data;
  const webBaseUrl = e.WEB_BASE_URL.replace(/\/+$/, '');
  return {
    categories: e.COLLECTOR_CATEGORIES,
    prefectures: e.COLLECTOR_PREFECTURES,
    entityScope: e.COLLECTOR_ENTITY_SCOPE,
    targetLanguages: e.COLLECTOR_TARGET_LANGUAGES,
    targetLanguageMode: e.COLLECTOR_TARGET_LANGUAGE_MODE,
    maxCandidatesPerRun: e.COLLECTOR_MAX_CANDIDATES_PER_RUN,
    crawl: {
      enabled: e.COLLECTOR_CRAWL_ENABLED,
      maxSitesPerRun: e.COLLECTOR_CRAWL_MAX_SITES_PER_RUN,
      maxPages: e.COLLECTOR_CRAWL_MAX_PAGES,
      intervalSec: e.COLLECTOR_CRAWL_INTERVAL_SEC,
      recrawlDays: e.COLLECTOR_RECRAWL_DAYS,
      userAgent: e.COLLECTOR_USER_AGENT ?? `bizshow-collector/0.1 (+${webBaseUrl}/bot)`,
    },
    llm: {
      enabled: e.COLLECTOR_LLM_ENABLED,
      monthlyBudgetJpy: e.COLLECTOR_LLM_MONTHLY_BUDGET_JPY,
      model: e.COLLECTOR_LLM_MODEL,
      priceInPerMTokJpy: e.COLLECTOR_LLM_PRICE_IN_PER_MTOK_JPY,
      priceOutPerMTokJpy: e.COLLECTOR_LLM_PRICE_OUT_PER_MTOK_JPY,
      apiKey: e.ANTHROPIC_API_KEY,
    },
    corporateNumberApiId: e.CORPORATE_NUMBER_API_ID,
    matchNameThreshold: e.COLLECTOR_MATCH_NAME_THRESHOLD,
    staleDays: e.COLLECTOR_STALE_DAYS,
    raw: { retentionDays: e.COLLECTOR_RAW_RETENTION_DAYS, dir: e.COLLECTOR_RAW_DIR },
  };
}

// ---- 事業者の種類の判定 --------------------------------------------------------

export interface EntityEvidence {
  kind: EntityEvidenceKind;
  /** 判定に使った語（法人格表記・開設者種別など）。事業者名そのものは記録しない */
  value: string;
}

export interface EntityClassification {
  entityType: EntityType;
  entityEvidence: EntityEvidence[];
}

export interface EntityClassificationInput {
  /** 事業者・施設の名称 */
  name: string;
  /** ソースの開設者種別などの項目（例: 医療法人・個人・国・都道府県・市町村） */
  sourceOwnerType?: string | null;
  /** ソースごとの対応表（例: mapping.json）で sourceOwnerType から決めた種類。あれば推定より優先 */
  sourceEntityType?: EntityType | null;
  /** 法人番号 API で実在を確認できた法人番号（F-114） */
  verifiedCorporateNumber?: string | null;
}

/** 名称の法人格表記（NFKC 正規化後に部分一致）。長いものを先に並べる */
const CORPORATE_SUFFIXES = [
  '特定非営利活動法人',
  '地方独立行政法人',
  '独立行政法人',
  '国立大学法人',
  '公益社団法人',
  '公益財団法人',
  '一般社団法人',
  '一般財団法人',
  '社会福祉法人',
  '社会医療法人',
  '医療法人',
  '学校法人',
  '宗教法人',
  '弁護士法人',
  '税理士法人',
  '行政書士法人',
  '司法書士法人',
  '社会保険労務士法人',
  '監査法人',
  '株式会社',
  '有限会社',
  '合同会社',
  '合名会社',
  '合資会社',
  '協同組合',
  'NPO法人',
  '(株)',
  '(有)',
  '(同)',
  '(医)',
  '(社福)',
  '(学)',
  '(一社)',
  '(一財)',
  '(公社)',
  '(公財)',
  '(特非)',
] as const;

/** 英語表記の法人格（単語境界で一致） */
const CORPORATE_SUFFIXES_EN = /\b(co\.,? ?ltd\.?|inc\.?|corp\.?|corporation|llc|k\.k\.|g\.k\.)(?=$|[\s,.)])/i;

/**
 * 公的機関の一覧（名称のパターン）。行政機関・公的窓口として扱う。
 * 入管・ハローワーク・自治体の窓口など、外国人向けの公的な相談先を想定。
 */
export const PUBLIC_ORGANIZATION_PATTERNS: readonly RegExp[] = [
  /(都|道|府|県)庁$/,
  /(市|区|町|村)役(所|場)$/,
  /(市|区|町|村)役(所|場)[^\s]*(課|室|窓口|センター)$/,
  /保健(所|センター)$/,
  /出入国在留管理(庁|局|支局)/,
  /外国人在留総合インフォメーションセンター/,
  /外国人在留支援センター/,
  /ハローワーク/,
  /公共職業安定所/,
  /労働基準監督署/,
  /法務局/,
  /年金事務所/,
  /税務署$/,
  /法テラス|日本司法支援センター/,
  /(都|道|府|県|市|区|町|村)立/,
  /^(国立|公立)/,
];

/** ソースの開設者種別の値 → 事業者の種類 */
function classifySourceOwnerType(raw: string): { type: EntityType; value: string } | null {
  const v = raw.normalize('NFKC').trim();
  if (!v) return null;
  if (/個人/.test(v)) return { type: 'individual', value: v };
  if (/^(国|都道府県|市町村|市区町村|地方公共団体|自治体|公的医療機関|都|道|府|県|市|区|町|村)$/.test(v) || /^(国|都道府県|市町村)(\(|・|$)/.test(v)) {
    return { type: 'public', value: v };
  }
  if (/法人|会社|組合/.test(v)) return { type: 'corporation', value: v };
  return null;
}

/**
 * 事業者の種類を判定する。根拠の優先順: ソースの項目 → 法人番号 → 公的機関の一覧 → 名称の法人格表記。
 * どれにも当たらなければ unknown（個人事業主の可能性があるため既定では保存しない）。
 */
export function classifyEntity(input: EntityClassificationInput): EntityClassification {
  const evidence: EntityEvidence[] = [];
  let entityType: EntityType | null = null;
  const decide = (type: EntityType, ev: EntityEvidence) => {
    evidence.push(ev);
    entityType ??= type;
  };

  if (input.sourceEntityType) {
    decide(input.sourceEntityType, { kind: 'source_field', value: input.sourceOwnerType?.trim() || input.sourceEntityType });
  } else if (input.sourceOwnerType) {
    const r = classifySourceOwnerType(input.sourceOwnerType);
    if (r) decide(r.type, { kind: 'source_field', value: r.value });
  }
  if (input.verifiedCorporateNumber && /^\d{13}$/.test(input.verifiedCorporateNumber)) {
    decide('corporation', { kind: 'corporate_number', value: input.verifiedCorporateNumber });
  }
  const name = input.name.normalize('NFKC').trim();
  const publicPattern = PUBLIC_ORGANIZATION_PATTERNS.find((p) => p.test(name));
  if (publicPattern) decide('public', { kind: 'public_list', value: name.match(publicPattern)?.[0] ?? '' });
  const suffix = CORPORATE_SUFFIXES.find((s) => name.includes(s)) ?? name.match(CORPORATE_SUFFIXES_EN)?.[0];
  if (suffix) decide('corporation', { kind: 'name_suffix', value: suffix });

  return { entityType: entityType ?? 'unknown', entityEvidence: evidence };
}

/** COLLECTOR_ENTITY_SCOPE の対象か */
export function isEntityInScope(type: EntityType, scope: EntityScope): boolean {
  if (scope === 'all') return true;
  if (scope === 'corporate') return type === 'corporation';
  return type === 'corporation' || type === 'public';
}

/**
 * 公開に本人の同意の記録が必要か（F-119、法務確認メモ 2.1 案 A）。
 * COLLECTOR_ENTITY_SCOPE=all で個人事業主・判定できない（個人事業主の可能性がある）候補は、同意の記録が無ければ承認しない。
 * corporate_public / corporate ではこれらは範囲外のため、法人・公的機関と確認した根拠（entityOverride）が無ければ承認しない
 */
export function requiresConsent(type: EntityType, scope: EntityScope): boolean {
  return scope === 'all' && (type === 'individual' || type === 'unknown');
}

// ---- 抽出結果 -----------------------------------------------------------------

const optionalTrimmed = (max: number) => z.preprocess(unsetIfEmpty, z.string().trim().max(max).optional());

/** 収集元の言語の LocalizedText。ja / en のどちらかは必須（翻訳はレビュー時に補う） */
const candidateText = (max: number) =>
  z
    .object({
      ja: optionalTrimmed(max),
      en: optionalTrimmed(max),
      vi: optionalTrimmed(max),
    })
    .refine((t) => Boolean(t.ja || t.en), { message: 'ja or en is required' });

/**
 * 収集元から抽出した掲載内容（ServiceListing 相当）。
 * 人名（代表者・院長・担当者など）と個人のメールアドレスの項目は持たない。未知の項目は捨てる。
 */
export const CandidateExtractSchema = z.object({
  category: z.enum(SERVICE_CATEGORIES),
  prefecture: z.enum(PREFECTURE_CODES as [PrefectureCode, ...PrefectureCode[]]),
  city: optionalTrimmed(LISTING_TEXT_MAX.city),
  /** 根拠のある対応言語。不明なら空 */
  supportedLanguages: z
    .array(z.enum(SUPPORTED_LOCALES))
    .default([])
    .transform((langs) => [...new Set(langs)]),
  name: candidateText(LISTING_TEXT_MAX.name),
  description: candidateText(LISTING_TEXT_MAX.description).optional(),
  address: candidateText(LISTING_TEXT_MAX.address).optional(),
  phone: z.preprocess(
    unsetIfEmpty,
    z
      .string()
      .trim()
      .regex(/^\+?[0-9()\- ]{6,20}$/)
      .optional(),
  ),
  websiteUrl: z.preprocess(
    unsetIfEmpty,
    z.url({ protocol: /^https?$/ }).max(LISTING_TEXT_MAX.websiteUrl).optional(),
  ),
  corporateNumber: z.preprocess(unsetIfEmpty, z.string().regex(/^\d{13}$/).optional()),
});
export type CandidateExtract = z.infer<typeof CandidateExtractSchema>;

/** 対応言語の根拠（どの言語を、何から判断したか） */
export interface LanguageEvidence {
  lang: SupportedLocale;
  /** 根拠の種類（例: source_field / html_lang / hreflang / path） */
  kind: string;
  /** 根拠の値（列名・URL など。転載にならない短い値） */
  value: string;
  /** kind=website（F-115）: 判定に使った手がかり（html_lang / hreflang / path / switch_link / body_text） */
  signal?: WebsiteLanguageSignal;
  /** kind=website（F-115）: 確認日（ISO 8601） */
  checkedAt?: string;
}

/** 公式サイトのクロールで対応言語を判定した手がかり（F-115） */
export const WEBSITE_LANGUAGE_SIGNALS = ['html_lang', 'hreflang', 'path', 'switch_link', 'body_text'] as const;
export type WebsiteLanguageSignal = (typeof WEBSITE_LANGUAGE_SIGNALS)[number];

/**
 * 公式サイトだけが根拠の言語（F-115）。収集元のデータに根拠が無く、管理者の確認が必要。
 * 例: open_data で vi の根拠が無く、website で vi が見つかった → ['vi']
 */
export function websiteOnlyLanguages(evidence: readonly LanguageEvidence[]): SupportedLocale[] {
  const fromWebsite = new Set(evidence.filter((e) => e.kind === 'website').map((e) => e.lang));
  const fromOther = new Set(evidence.filter((e) => e.kind !== 'website').map((e) => e.lang));
  return SUPPORTED_LOCALES.filter((l) => fromWebsite.has(l) && !fromOther.has(l));
}

/** 対象言語の根拠があるか */
export function hasTargetLanguageEvidence(
  evidence: readonly LanguageEvidence[],
  targetLanguages: readonly SupportedLocale[],
): boolean {
  return evidence.some((e) => targetLanguages.includes(e.lang));
}

// ---- 名寄せ用の正規化（F-114） --------------------------------------------------

/** 電話番号を照合用に正規化（数字のみ、+81 は国内の 0 始まりに） */
export function normalizePhoneForMatch(phone: string | null | undefined): string | undefined {
  if (!phone) return undefined;
  const v = phone.normalize('NFKC').trim();
  let digits = v.replace(/\D/g, '');
  if (v.startsWith('+81') || (digits.startsWith('81') && digits.length >= 11 && !digits.startsWith('0'))) {
    digits = `0${digits.slice(2).replace(/^0/, '')}`;
  }
  return digits.length >= 6 ? digits : undefined;
}

const HYPHENS = /[‐‑‒–—―−－ｰ]/g;

/**
 * 住所を照合用に正規化する。全角半角・空白・ハイフンの種類・「丁目/番地/番/号」の表記ゆれを統一し、
 * 先頭の都道府県名を除く（都道府県は別項目で照合する）。
 */
export function normalizeAddressForMatch(address: string | null | undefined): string | undefined {
  if (!address) return undefined;
  let v = address.normalize('NFKC').replace(/\s+/g, '').replace(HYPHENS, '-');
  // 数字に挟まれた長音記号はハイフンの誤記
  v = v.replace(/(\d)ー(?=\d)/g, '$1-');
  v = v.replace(/(\d+)丁目/g, '$1-').replace(/(\d+)番地?/g, '$1-').replace(/(\d+)号/g, '$1');
  v = v.replace(/-+/g, '-').replace(/-$/, '');
  const pref = PREFECTURES.find((p) => v.startsWith(p.ja));
  if (pref) v = v.slice(pref.ja.length);
  return v.toLowerCase() || undefined;
}

const NAME_NOISE = /株式会社|有限会社|合同会社|一般社団法人|一般財団法人|公益社団法人|公益財団法人|特定非営利活動法人|社会福祉法人|医療法人社団|医療法人財団|医療法人|学校法人|\((株|有|医|社福|一社|一財)\)|co\.,?ltd\.?|inc\.?|[\s・.,、。]/gi;

/** 名称の類似度（法人格表記・空白・記号を除いた文字 bigram の Dice 係数、0〜1） */
export function nameSimilarity(a: string, b: string): number {
  const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(NAME_NOISE, '');
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const grams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) ?? 0) + 1);
    return m;
  };
  const gx = grams(x);
  const gy = grams(y);
  let overlap = 0;
  for (const [g, n] of gx) overlap += Math.min(n, gy.get(g) ?? 0);
  const total = Math.max(x.length - 1, 0) + Math.max(y.length - 1, 0);
  return total === 0 ? 0 : (2 * overlap) / total;
}

// ---- スコア（F-114） ---------------------------------------------------------

/** 候補のスコアの重み（合計 100） */
export const CANDIDATE_SCORE_WEIGHTS = {
  /** 情報源の信頼度 */
  source: { open_data: 40, partner: 40, api: 30, crawl: 20 } satisfies Record<DataSourceKind, number>,
  /** 必須項目（名称・住所・電話・都道府県）がすべて揃ったときの点。項目数に比例 */
  requiredFields: 30,
  /** 対象言語（COLLECTOR_TARGET_LANGUAGES）の根拠がある */
  targetLanguage: 20,
  /** 対象言語以外の外国語の根拠だけがある */
  otherForeignLanguage: 10,
  /** 別の情報源の候補と一致した */
  multiSource: 10,
} as const;

export interface ScoreInput {
  sourceKind: DataSourceKind;
  extracted: Pick<CandidateExtract, 'name' | 'address' | 'phone' | 'prefecture'>;
  languageEvidence: readonly LanguageEvidence[];
  targetLanguages: readonly SupportedLocale[];
  matchedOtherSource: boolean;
  /** 法人番号 API で閉鎖法人と確認できた */
  closedCorporation?: boolean;
}

/** スコアのうち対応言語の根拠の点（対象言語 20 / それ以外の外国語のみ 10 / なし 0） */
export function languageEvidenceScore(evidence: readonly LanguageEvidence[], targetLanguages: readonly SupportedLocale[]): number {
  const w = CANDIDATE_SCORE_WEIGHTS;
  const foreign = evidence.filter((l) => l.lang !== 'ja');
  if (foreign.some((l) => targetLanguages.includes(l.lang))) return w.targetLanguage;
  return foreign.length > 0 ? w.otherForeignLanguage : 0;
}

/** 候補の信頼度（0〜100）。閉鎖法人は 0 */
export function scoreCandidate(input: ScoreInput): number {
  if (input.closedCorporation) return 0;
  const w = CANDIDATE_SCORE_WEIGHTS;
  const e = input.extracted;
  const filled = [Boolean(e.name?.ja || e.name?.en), Boolean(e.address?.ja || e.address?.en), Boolean(e.phone), Boolean(e.prefecture)].filter(
    Boolean,
  ).length;
  const language = languageEvidenceScore(input.languageEvidence, input.targetLanguages);
  const score =
    w.source[input.sourceKind] + Math.round((w.requiredFields * filled) / 4) + language + (input.matchedOtherSource ? w.multiSource : 0);
  return Math.max(0, Math.min(100, score));
}

// ---- 掲載候補のレビュー（F-113） ------------------------------------------------

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const flagQuery = z.preprocess(
  emptyToUndefined,
  z
    .enum(['1', 'true', '0', 'false'])
    .transform((v) => v === '1' || v === 'true')
    .optional(),
);

export const CandidateListQuerySchema = z.object({
  /** 既定 pending */
  status: z.preprocess(emptyToUndefined, z.enum(CANDIDATE_STATUSES).default('pending')),
  /** DataSource.id */
  source: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
  category: z.preprocess(emptyToUndefined, z.enum(SERVICE_CATEGORIES).optional()),
  prefecture: z.preprocess(emptyToUndefined, z.enum(PREFECTURE_CODES as [PrefectureCode, ...PrefectureCode[]]).optional()),
  minScore: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(100).optional()),
  /** true = 対象言語（COLLECTOR_TARGET_LANGUAGES）の根拠がある候補のみ */
  targetLang: flagQuery,
  page: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).default(1)),
  limit: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(100).default(50)),
});
export type CandidateListQuery = z.infer<typeof CandidateListQuerySchema>;

export const CANDIDATE_REVIEW_NOTE_MAX = 500;
const reviewNote = z.preprocess(emptyToUndefined, z.string().trim().max(CANDIDATE_REVIEW_NOTE_MAX).optional());

/**
 * 承認: 掲載の全項目（管理者が編集した値）＋ slug・公開状態。
 * 種類が個人・不明の候補を承認するには、管理者が種類と根拠（法人番号など）を入力する（entityOverride）。
 * COLLECTOR_ENTITY_SCOPE=all の場合は、本人の同意の記録（掲載申請・掲載案内への承諾など）を入力する（consent、F-119）
 */
export const ApproveCandidateSchema = AdminServiceInputSchema.extend({
  entityOverride: z
    .object({
      entityType: z.enum(['corporation', 'public']),
      evidence: z.string().trim().min(1).max(200),
    })
    .optional(),
  consent: z.object({ evidence: z.string().trim().min(1).max(200) }).optional(),
});
export type ApproveCandidateInput = z.infer<typeof ApproveCandidateSchema>;

export const RejectCandidateSchema = z.object({ reason: reviewNote });
export const HoldCandidateSchema = z.object({ note: reviewNote });

/** 管理画面用の掲載候補 */
export interface AdminCandidate {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceUrl: string | null;
  sourceRecordId: string;
  /** ISO 8601 */
  fetchedAt: string;
  extracted: CandidateExtract;
  languageEvidence: LanguageEvidence[];
  hasTargetLanguage: boolean;
  entityType: EntityType;
  entityEvidence: EntityEvidence[];
  corporateNumber: string | null;
  matchedListingId: string | null;
  matchType: CandidateMatchType;
  score: number;
  /** LLM で空欄を補完した項目（F-117: phone / address / city / name.en）。管理者の確認が必要 */
  llmFilledFields?: string[];
  status: CandidateStatus;
  reviewNote: string | null;
  reviewedBy: string | null;
  /** ISO 8601 */
  reviewedAt: string | null;
  createdAt: string;
}

/** 既存掲載と候補の差分の対象項目 */
export const CANDIDATE_DIFF_FIELDS = [
  'category',
  'prefecture',
  'city',
  'supportedLanguages',
  'name',
  'description',
  'address',
  'phone',
  'websiteUrl',
] as const;
export type CandidateDiffField = (typeof CANDIDATE_DIFF_FIELDS)[number];

export interface CandidateFieldDiff {
  field: CandidateDiffField;
  current: unknown;
  candidate: unknown;
}

/** 候補詳細: 候補と、名寄せで一致した既存掲載・項目ごとの差分 */
export interface AdminCandidateDetail extends AdminCandidate {
  matchedListing: AdminService | null;
  /** 値が異なる項目のみ。候補に値が無い項目・言語は比較しない */
  diff: CandidateFieldDiff[];
  /** COLLECTOR_ENTITY_SCOPE で承認できる種類か（false なら entityOverride が必要） */
  entityApprovable: boolean;
  /** 承認に本人の同意の記録が必要か（F-119: COLLECTOR_ENTITY_SCOPE=all の個人事業主・不明） */
  consentRequired: boolean;
  /** 説明文の下書き（F-117）を作成できるか（LLM が有効で、レビュー前の候補） */
  descriptionDraftAvailable: boolean;
}

const normalizeForDiff = (v: unknown): unknown => {
  if (v === null || v === undefined || v === '') return null;
  if (Array.isArray(v)) return [...v].sort();
  if (typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined && x !== null && x !== '');
    return entries.length ? Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b))) : null;
  }
  return v;
};

/** 既存掲載と候補の差分（候補に値がある項目のうち、既存と異なるもの） */
export function diffCandidate(extracted: CandidateExtract, listing: AdminService): CandidateFieldDiff[] {
  return CANDIDATE_DIFF_FIELDS.flatMap((field) => {
    const candidate = normalizeForDiff(extracted[field]);
    if (candidate === null || (Array.isArray(candidate) && candidate.length === 0)) return [];
    const raw = listing[field];
    // 多言語テキストは候補にある言語だけを比べる（候補に無い言語は既存の値を残すため差分にしない）
    const comparable =
      candidate && typeof candidate === 'object' && !Array.isArray(candidate) && raw && typeof raw === 'object'
        ? Object.fromEntries(Object.keys(candidate).map((k) => [k, (raw as Record<string, unknown>)[k]]))
        : raw;
    const current = normalizeForDiff(comparable);
    return JSON.stringify(current) === JSON.stringify(candidate) ? [] : [{ field, current: raw ?? null, candidate: extracted[field] }];
  });
}
