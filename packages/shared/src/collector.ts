import { z } from 'zod';
import {
  LISTING_TEXT_MAX,
  PREFECTURES,
  SERVICE_CATEGORIES,
  SUPPORTED_LOCALES,
  type PrefectureCode,
  type ServiceCategory,
  type SupportedLocale,
} from './domain';

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
export const ENTITY_EVIDENCE_KINDS = ['source_field', 'corporate_number', 'name_suffix', 'public_list'] as const;
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
  COLLECTOR_LLM_ENABLED: bool(false),
  COLLECTOR_LLM_MONTHLY_BUDGET_JPY: int(0, 0),
  COLLECTOR_LLM_MODEL: optionalString,
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
  llm: { enabled: boolean; monthlyBudgetJpy: number; model?: string };
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

  if (input.sourceOwnerType) {
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

// ---- 抽出結果 -----------------------------------------------------------------

const optionalTrimmed = (max: number) => z.preprocess(unsetIfEmpty, z.string().trim().max(max).optional());

/** 収集元の言語の LocalizedText。ja / en のどちらかは必須（翻訳はレビュー時に補う） */
const candidateText = (max: number) =>
  z
    .object({
      ja: optionalTrimmed(max),
      en: optionalTrimmed(max),
      zh: optionalTrimmed(max),
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
}

/** 対象言語の根拠があるか */
export function hasTargetLanguageEvidence(
  evidence: readonly LanguageEvidence[],
  targetLanguages: readonly SupportedLocale[],
): boolean {
  return evidence.some((e) => targetLanguages.includes(e.lang));
}
