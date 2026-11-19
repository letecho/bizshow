import { z } from 'zod';

// ---- Locale ----------------------------------------------------------------

/** 対応言語（F-120 で zh を廃止。DB に残る zh のデータは表示・検索の対象外） */
export const SUPPORTED_LOCALES = ['ja', 'en', 'vi'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
/** 短縮エイリアス */
export type Locale = SupportedLocale;
export const DEFAULT_LOCALE: SupportedLocale = 'en';

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** 翻訳テキスト。en は必須、他言語は任意 */
export type LocalizedText = { en: string } & Partial<Record<SupportedLocale, string>>;

/** DB の言語配列から対応言語だけを残す（廃止した zh などを除く） */
export function toSupportedLocales(values: readonly string[]): SupportedLocale[] {
  return values.filter(isSupportedLocale);
}

/** DB の LocalizedText（JSON）から対応言語のキーだけを残す（廃止した zh などを除く） */
export function toLocalizedText(value: unknown): LocalizedText {
  const record = (value ?? {}) as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const locale of SUPPORTED_LOCALES) {
    if (typeof record[locale] === 'string') result[locale] = record[locale] as string;
  }
  return { en: '', ...result } as LocalizedText;
}

/** 指定言語のテキストを返す。欠損（未定義・空文字）時は en にフォールバック */
export function pickText(text: LocalizedText, locale: SupportedLocale): string {
  return text[locale] || text.en;
}

// ---- Category / Prefecture --------------------------------------------------

export const SERVICE_CATEGORIES = [
  'medical',
  'legal',
  'housing',
  'telecom',
  'finance',
  'education',
  'work',
  'daily',
] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export interface Prefecture {
  code: string;
  ja: string;
  en: string;
}

export const PREFECTURES = [
  { code: 'hokkaido', ja: '北海道', en: 'Hokkaido' },
  { code: 'aomori', ja: '青森県', en: 'Aomori' },
  { code: 'iwate', ja: '岩手県', en: 'Iwate' },
  { code: 'miyagi', ja: '宮城県', en: 'Miyagi' },
  { code: 'akita', ja: '秋田県', en: 'Akita' },
  { code: 'yamagata', ja: '山形県', en: 'Yamagata' },
  { code: 'fukushima', ja: '福島県', en: 'Fukushima' },
  { code: 'ibaraki', ja: '茨城県', en: 'Ibaraki' },
  { code: 'tochigi', ja: '栃木県', en: 'Tochigi' },
  { code: 'gunma', ja: '群馬県', en: 'Gunma' },
  { code: 'saitama', ja: '埼玉県', en: 'Saitama' },
  { code: 'chiba', ja: '千葉県', en: 'Chiba' },
  { code: 'tokyo', ja: '東京都', en: 'Tokyo' },
  { code: 'kanagawa', ja: '神奈川県', en: 'Kanagawa' },
  { code: 'niigata', ja: '新潟県', en: 'Niigata' },
  { code: 'toyama', ja: '富山県', en: 'Toyama' },
  { code: 'ishikawa', ja: '石川県', en: 'Ishikawa' },
  { code: 'fukui', ja: '福井県', en: 'Fukui' },
  { code: 'yamanashi', ja: '山梨県', en: 'Yamanashi' },
  { code: 'nagano', ja: '長野県', en: 'Nagano' },
  { code: 'gifu', ja: '岐阜県', en: 'Gifu' },
  { code: 'shizuoka', ja: '静岡県', en: 'Shizuoka' },
  { code: 'aichi', ja: '愛知県', en: 'Aichi' },
  { code: 'mie', ja: '三重県', en: 'Mie' },
  { code: 'shiga', ja: '滋賀県', en: 'Shiga' },
  { code: 'kyoto', ja: '京都府', en: 'Kyoto' },
  { code: 'osaka', ja: '大阪府', en: 'Osaka' },
  { code: 'hyogo', ja: '兵庫県', en: 'Hyogo' },
  { code: 'nara', ja: '奈良県', en: 'Nara' },
  { code: 'wakayama', ja: '和歌山県', en: 'Wakayama' },
  { code: 'tottori', ja: '鳥取県', en: 'Tottori' },
  { code: 'shimane', ja: '島根県', en: 'Shimane' },
  { code: 'okayama', ja: '岡山県', en: 'Okayama' },
  { code: 'hiroshima', ja: '広島県', en: 'Hiroshima' },
  { code: 'yamaguchi', ja: '山口県', en: 'Yamaguchi' },
  { code: 'tokushima', ja: '徳島県', en: 'Tokushima' },
  { code: 'kagawa', ja: '香川県', en: 'Kagawa' },
  { code: 'ehime', ja: '愛媛県', en: 'Ehime' },
  { code: 'kochi', ja: '高知県', en: 'Kochi' },
  { code: 'fukuoka', ja: '福岡県', en: 'Fukuoka' },
  { code: 'saga', ja: '佐賀県', en: 'Saga' },
  { code: 'nagasaki', ja: '長崎県', en: 'Nagasaki' },
  { code: 'kumamoto', ja: '熊本県', en: 'Kumamoto' },
  { code: 'oita', ja: '大分県', en: 'Oita' },
  { code: 'miyazaki', ja: '宮崎県', en: 'Miyazaki' },
  { code: 'kagoshima', ja: '鹿児島県', en: 'Kagoshima' },
  { code: 'okinawa', ja: '沖縄県', en: 'Okinawa' },
] as const satisfies readonly Prefecture[];
export type PrefectureCode = (typeof PREFECTURES)[number]['code'];

const PREFECTURE_CODES = PREFECTURES.map((p) => p.code) as [PrefectureCode, ...PrefectureCode[]];

// ---- Search query -----------------------------------------------------------

/** フォームの空欄（"category=" など）は未指定として扱う */
const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

export const ServiceSearchQuerySchema = z.object({
  q: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
  category: z.preprocess(emptyToUndefined, z.enum(SERVICE_CATEGORIES).optional()),
  prefecture: z.preprocess(emptyToUndefined, z.enum(PREFECTURE_CODES).optional()),
  /** 対応言語で絞り込み */
  lang: z.preprocess(emptyToUndefined, z.enum(SUPPORTED_LOCALES).optional()),
  page: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).default(1)),
  limit: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(50).default(20)),
});
export type ServiceSearchQuery = z.infer<typeof ServiceSearchQuerySchema>;

// ---- Service ----------------------------------------------------------------

/** 一覧表示用 */
export interface ServiceSummary {
  id: string;
  slug: string;
  category: ServiceCategory;
  prefecture: PrefectureCode;
  city: string | null;
  supportedLanguages: SupportedLocale[];
  name: LocalizedText;
}

/** 詳細表示用 */
export interface ServiceDetail extends ServiceSummary {
  description: LocalizedText;
  address: LocalizedText | null;
  phone: string | null;
  websiteUrl: string | null;
  /** 掲載画像（CDN 経由の URL）。未設定は null */
  imageUrl: string | null;
  /** 出典（収集元の出典表示文と URL、F-116）。手入力の掲載は空 */
  sources: ListingSource[];
  /** 掲載内容を最後に確認した日時（ISO 8601、F-116）。未確認は null */
  lastVerifiedAt: string | null;
  /** ISO 8601 */
  updatedAt: string;
}

// ---- Listing source (F-116) --------------------------------------------------

export const LISTING_SOURCE_ATTRIBUTION_MAX = 300;

/** 掲載の出典（ServiceListing.sources の要素）。DataSource.attribution と候補の sourceUrl から作る */
export const ListingSourceSchema = z.object({
  attribution: z.string().trim().min(1).max(LISTING_SOURCE_ATTRIBUTION_MAX),
  url: z.url({ protocol: /^https?$/ }).max(500).nullable().default(null),
});
export type ListingSource = z.infer<typeof ListingSourceSchema>;

/** DB の Json 値を出典の配列に変換する。形式が不正な要素は表示しない */
export function parseListingSources(value: unknown): ListingSource[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = ListingSourceSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

// ---- Inquiry ----------------------------------------------------------------

export const INQUIRY_MESSAGE_MAX = 2000;

/** POST /api/v1/inquiries の入力。website はボット検出用のハニーポット（人は空のまま送る） */
export const InquiryInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().max(254).pipe(z.email()),
  message: z.string().trim().min(1).max(INQUIRY_MESSAGE_MAX),
  locale: z.enum(SUPPORTED_LOCALES),
  website: z.string().max(500).optional(),
});
export type InquiryInput = z.infer<typeof InquiryInputSchema>;

// ---- Listing input (掲載申請・管理画面で共通) -------------------------------

/** 掲載の文字入力の上限（スキーマとフォームの maxLength で共用） */
export const LISTING_TEXT_MAX = {
  city: 100,
  name: 200,
  description: 5000,
  address: 300,
  phone: 20,
  websiteUrl: 500,
} as const;

const optionalText = (max: number) => z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());

/** LocalizedText の入力。en 必須、他言語は任意（空欄は未入力扱い） */
export const localizedTextInput = (max: number) =>
  z.object({
    en: z.string().trim().min(1).max(max),
    ja: optionalText(max),
    vi: optionalText(max),
  });

/** 掲載内容（ServiceListing 相当の入力項目。slug・公開状態は含まない） */
export const ListingFieldsSchema = z.object({
  category: z.enum(SERVICE_CATEGORIES),
  prefecture: z.enum(PREFECTURE_CODES),
  city: optionalText(LISTING_TEXT_MAX.city),
  supportedLanguages: z
    .array(z.enum(SUPPORTED_LOCALES))
    .min(1)
    .transform((langs) => [...new Set(langs)]),
  name: localizedTextInput(LISTING_TEXT_MAX.name),
  description: localizedTextInput(LISTING_TEXT_MAX.description),
  address: localizedTextInput(LISTING_TEXT_MAX.address).optional(),
  phone: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .regex(/^\+?[0-9()\- ]{6,20}$/)
      .optional(),
  ),
  websiteUrl: z.preprocess(emptyToUndefined, z.url({ protocol: /^https?$/ }).max(LISTING_TEXT_MAX.websiteUrl).optional()),
});
export type ListingFields = z.infer<typeof ListingFieldsSchema>;

export const LISTING_REQUEST_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type ListingRequestStatus = (typeof LISTING_REQUEST_STATUSES)[number];

/** POST /api/v1/listing-requests の入力（掲載内容＋担当者） */
export const ListingRequestInputSchema = ListingFieldsSchema.extend({
  contactName: z.string().trim().min(1).max(100),
  contactEmail: z.string().trim().max(254).pipe(z.email()),
});
export type ListingRequestInput = z.infer<typeof ListingRequestInputSchema>;

// ---- Admin (F-106) -----------------------------------------------------------

// ---- Image upload (F-107) ----------------------------------------------------

export const IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type ImageContentType = (typeof IMAGE_CONTENT_TYPES)[number];
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
/** アップロード先のキー（listings/<uuid>.<ext>） */
export const IMAGE_KEY_PATTERN = /^listings\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

/** POST /api/v1/admin/uploads の入力 */
export const UploadRequestSchema = z.object({
  contentType: z.enum(IMAGE_CONTENT_TYPES),
  /** バイト数（presigned URL に署名され、異なるサイズの PUT は拒否される） */
  size: z.number().int().min(1).max(IMAGE_MAX_BYTES),
});
export type UploadRequest = z.infer<typeof UploadRequestSchema>;

/** POST /api/v1/admin/uploads の結果。uploadUrl へ headers を付けて PUT する */
export interface UploadTicket {
  key: string;
  uploadUrl: string;
  headers: Record<string, string>;
  publicUrl: string;
}

/** URL 用 slug: 英小文字・数字をハイフンで区切る */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MAX = 100;
export const SlugSchema = z.string().trim().min(1).max(SLUG_MAX).regex(SLUG_PATTERN);

/** 管理画面での掲載作成・更新（PUT は全項目置き換え） */
export const AdminServiceInputSchema = ListingFieldsSchema.extend({
  slug: SlugSchema,
  isPublished: z.boolean().default(false),
  /** POST /api/v1/admin/uploads で発行したキー */
  imageKey: z.preprocess(emptyToUndefined, z.string().regex(IMAGE_KEY_PATTERN).optional()),
});
export type AdminServiceInput = z.infer<typeof AdminServiceInputSchema>;

const booleanQuery = z.preprocess(emptyToUndefined, z.enum(['true', 'false']).transform((v) => v === 'true').optional());
const pageQuery = z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).default(1));
const limitQuery = z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(100).default(50));

export const AdminServiceListQuerySchema = z.object({
  q: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
  /** true = 公開のみ / false = 非公開のみ / 未指定 = すべて */
  published: booleanQuery,
  /** true = 収集した掲載のうち COLLECTOR_STALE_DAYS を過ぎても確認できていないもの（F-116） */
  stale: booleanQuery,
  page: pageQuery,
  limit: limitQuery,
});
export type AdminServiceListQuery = z.infer<typeof AdminServiceListQuerySchema>;

export const ListingRequestListQuerySchema = z.object({
  status: z.preprocess(emptyToUndefined, z.enum(LISTING_REQUEST_STATUSES).optional()),
  page: pageQuery,
  limit: limitQuery,
});
export type ListingRequestListQuery = z.infer<typeof ListingRequestListQuerySchema>;

export const PublishInputSchema = z.object({ isPublished: z.boolean() });

/** 申請承認時に管理者が決める項目 */
export const ApproveListingRequestSchema = z.object({
  slug: SlugSchema,
  isPublished: z.boolean().default(false),
});

/** 管理画面用の掲載（非公開も含む） */
export interface AdminService extends ServiceDetail {
  isPublished: boolean;
  imageKey: string | null;
  /** ISO 8601 */
  createdAt: string;
}

/** 管理画面用の掲載申請 */
export interface ListingRequest extends ListingRequestInput {
  id: string;
  status: ListingRequestStatus;
  /** ISO 8601 */
  createdAt: string;
  updatedAt: string;
}

// ---- Crawl blocklist (F-116) -------------------------------------------------

/** 登録理由: 事業者からの停止依頼 / 利用規約で禁止 / robots.txt で拒否 */
export const CRAWL_BLOCK_REASONS = ['optout', 'terms', 'robots'] as const;
export type CrawlBlockReason = (typeof CRAWL_BLOCK_REASONS)[number];

export const CRAWL_BLOCK_NOTE_MAX = 500;

const HOSTNAME_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

/** ドメインの正規化: 前後の空白・末尾のドットを除き小文字に。URL が貼られたらホスト名だけを使う */
export function normalizeDomain(value: string): string {
  let host = value.trim().toLowerCase();
  if (host.includes('://')) {
    try {
      host = new URL(host).hostname;
    } catch {
      return host;
    }
  }
  return host.replace(/\.$/, '');
}

const optionalTrimmed = (v: unknown) => (typeof v === 'string' ? (v.trim() === '' ? undefined : v.trim()) : v);

export const CrawlBlocklistInputSchema = z
  .object({
    /** このドメインとサブドメインを対象にする（例: example.com → www.example.com も含む） */
    domain: z.preprocess(
      (v) => (typeof v === 'string' ? optionalTrimmed(normalizeDomain(v)) : v),
      z.string().regex(HOSTNAME_PATTERN).optional(),
    ),
    corporateNumber: z.preprocess(optionalTrimmed, z.string().regex(/^\d{13}$/).optional()),
    reason: z.enum(CRAWL_BLOCK_REASONS),
    note: z.preprocess(optionalTrimmed, z.string().max(CRAWL_BLOCK_NOTE_MAX).optional()),
  })
  .refine((v) => v.domain !== undefined || v.corporateNumber !== undefined, {
    message: 'domain or corporateNumber is required',
    path: ['domain'],
  });
export type CrawlBlocklistInput = z.infer<typeof CrawlBlocklistInputSchema>;

/** 管理画面用のブロックリストの行 */
export interface CrawlBlockEntry {
  id: string;
  domain: string | null;
  corporateNumber: string | null;
  reason: CrawlBlockReason;
  note: string | null;
  /** ISO 8601 */
  createdAt: string;
}

/** ホスト名がブロックリストのドメイン（またはそのサブドメイン）に当たるか */
export function isDomainBlocked(hostname: string, blockedDomains: readonly string[]): boolean {
  const host = normalizeDomain(hostname);
  return blockedDomains.some((d) => host === d || host.endsWith(`.${d}`));
}

/** 事業者（Web サイトのドメイン・法人番号）がブロックリストに当たるか。収集で候補を作らない判定に使う */
export function isBlockedEntity(
  entries: readonly Pick<CrawlBlockEntry, 'domain' | 'corporateNumber'>[],
  target: { websiteUrl?: string | null; corporateNumber?: string | null },
): boolean {
  if (target.corporateNumber && entries.some((e) => e.corporateNumber === target.corporateNumber)) return true;
  if (!target.websiteUrl) return false;
  let host: string;
  try {
    host = new URL(target.websiteUrl).hostname;
  } catch {
    return false;
  }
  const domains = entries.map((e) => e.domain).filter((d): d is string => Boolean(d));
  return isDomainBlocked(host, domains);
}
