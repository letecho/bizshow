import { z } from 'zod';
import { PREFECTURES, type ServiceCategory } from './domain';
import type { CandidateExtract } from './collector';

// ---- 収集した事業者への掲載案内（F-118）----
// 管理者が候補ごとに 1 件ずつ送る。一斉送信・お問い合わせフォームへの自動送信はしない。
// 特定電子メール法: 事業者が自ら Web 上で公表しているアドレスにだけ送り、送信者情報と受信拒否の方法を表示する

export const OUTREACH_DAILY_LIMIT_DEFAULT = 10;
export const OUTREACH_DAILY_LIMIT_MAX = 1000;
export const OUTREACH_LINK_TTL_DAYS_DEFAULT = 30;
export const OUTREACH_LINK_SECRET_MIN_LENGTH = 32;
/** メールの件名・本文に出すサイト名（Web の辞書 ja の site.title と同じ） */
export const OUTREACH_SITE_NAME = '在日外国人向けサービス検索';

/** メール本文に表示する送信者情報（特定電子メール法の表示事項） */
export interface OutreachSender {
  name: string;
  address: string;
  /** 問い合わせ先（メールアドレス・電話番号など） */
  contact: string;
}

export interface OutreachConfig {
  enabled: boolean;
  dailyLimit: number;
  linkTtlDays: number;
  /** enabled のときは必ず設定されている */
  sender?: OutreachSender;
  /** 案内リンク・受信拒否リンクの署名鍵（enabled のときは必須。無効時も設定されていれば受信拒否リンクの検証に使う） */
  linkSecret?: string;
  /** リンクの Web のオリジン（WEB_ORIGIN。enabled のときは必須） */
  webOrigin?: string;
}

function parseIntInRange(name: string, raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

/**
 * OUTREACH_* を読む。既定は無効（OUTREACH_ENABLED=true のときだけ送信できる）。
 * 有効なのに送信者情報・署名鍵・WEB_ORIGIN が欠けている場合は起動エラー（表示事項の無いメールを送らない）
 */
export function loadOutreachConfig(env: Record<string, string | undefined>): OutreachConfig {
  const enabledRaw = (env.OUTREACH_ENABLED ?? '').trim().toLowerCase();
  if (enabledRaw !== '' && enabledRaw !== 'true' && enabledRaw !== 'false') {
    throw new Error('OUTREACH_ENABLED must be true or false');
  }
  const enabled = enabledRaw === 'true';
  const dailyLimit = parseIntInRange(
    'OUTREACH_DAILY_LIMIT',
    env.OUTREACH_DAILY_LIMIT,
    OUTREACH_DAILY_LIMIT_DEFAULT,
    1,
    OUTREACH_DAILY_LIMIT_MAX,
  );
  const linkTtlDays = parseIntInRange('OUTREACH_LINK_TTL_DAYS', env.OUTREACH_LINK_TTL_DAYS, OUTREACH_LINK_TTL_DAYS_DEFAULT, 1, 365);
  const text = (key: string) => (env[key] ?? '').trim();
  const linkSecret = text('OUTREACH_LINK_SECRET');
  if (linkSecret !== '' && linkSecret.length < OUTREACH_LINK_SECRET_MIN_LENGTH) {
    throw new Error(`OUTREACH_LINK_SECRET must be at least ${OUTREACH_LINK_SECRET_MIN_LENGTH} characters`);
  }
  // 無効にした後も、送信済みメールの受信拒否リンクは使えるようにする（署名鍵は設定されていれば読む）
  if (!enabled) return { enabled, dailyLimit, linkTtlDays, ...(linkSecret && { linkSecret }) };

  const missing = ['OUTREACH_SENDER_NAME', 'OUTREACH_SENDER_ADDRESS', 'OUTREACH_SENDER_CONTACT', 'OUTREACH_LINK_SECRET', 'WEB_ORIGIN'].filter(
    (key) => text(key) === '',
  );
  if (missing.length) throw new Error(`OUTREACH_ENABLED=true requires ${missing.join(', ')}`);
  let webOrigin: string;
  try {
    const url = new URL(text('WEB_ORIGIN'));
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('protocol');
    webOrigin = url.origin;
  } catch {
    throw new Error('WEB_ORIGIN must be an http(s) URL when OUTREACH_ENABLED=true');
  }
  return {
    enabled,
    dailyLimit,
    linkTtlDays,
    sender: { name: text('OUTREACH_SENDER_NAME'), address: text('OUTREACH_SENDER_ADDRESS'), contact: text('OUTREACH_SENDER_CONTACT') },
    linkSecret,
    webOrigin,
  };
}

/** 案内の送信（管理者が宛先と、そのアドレスが公表されているページを確認して入力する） */
export const SendOutreachSchema = z.object({
  to: z
    .string()
    .trim()
    .max(254)
    .pipe(z.email())
    .transform((v) => v.toLowerCase()),
  /** 事業者がそのアドレスを自ら公表しているページの URL（記録用） */
  publishedUrl: z.url({ protocol: /^https?$/ }).max(2000),
  /** 公表ページに受信拒否（営業メールお断り等）の表示が無いことを確認した */
  confirmedNoOptOutNotice: z.literal(true),
});
export type SendOutreachInput = z.infer<typeof SendOutreachSchema>;

/** 受信拒否の手動登録（返信・電話などで受けた場合） */
export const OutreachOptOutInputSchema = z.object({
  email: z
    .string()
    .trim()
    .max(254)
    .pipe(z.email())
    .transform((v) => v.toLowerCase()),
});

/** 受信拒否ページからの送信 */
export const OutreachOptOutTokenSchema = z.object({ token: z.string().min(1).max(500) });

export const OUTREACH_STATUSES = ['pending', 'sent', 'failed'] as const;
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];

/** 送信履歴の 1 件 */
export interface OutreachRecord {
  id: string;
  candidateId: string;
  email: string;
  publishedUrl: string;
  status: OutreachStatus;
  sentBy: string;
  createdAt: string;
}

/** 候補詳細の「掲載案内」欄 */
export interface AdminOutreachStatus {
  enabled: boolean;
  dailyLimit: number;
  /** 今日（日本時間）送信した件数 */
  sentToday: number;
  history: OutreachRecord[];
}

/** 掲載申請フォームの事前入力（案内リンク）。収集元の説明文は含めない */
export type ListingInvitePrefill = Pick<
  CandidateExtract,
  'category' | 'prefecture' | 'city' | 'supportedLanguages' | 'name' | 'address' | 'phone' | 'websiteUrl'
>;

export function listingInvitePrefill(extract: CandidateExtract): ListingInvitePrefill {
  const { category, prefecture, city, supportedLanguages, name, address, phone, websiteUrl } = extract;
  return { category, prefecture, city, supportedLanguages, name, address, phone, websiteUrl };
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 日本時間の当日 0 時（1 日の送信上限の基準） */
export function startOfJstDay(now: Date): Date {
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()) - JST_OFFSET_MS);
}

const CATEGORY_LABELS_JA: Record<ServiceCategory, string> = {
  medical: '医療',
  legal: '法律',
  housing: '住まい',
  telecom: '通信',
  finance: '金融',
  education: '教育',
  work: '仕事',
  daily: '生活',
};

const LANGUAGE_LABELS_JA: Record<string, string> = { ja: '日本語', en: '英語', vi: 'ベトナム語' };

export interface OutreachMessageInput {
  extract: CandidateExtract;
  sender: OutreachSender;
  inviteUrl: string;
  optOutUrl: string;
  inviteExpiresAt: Date;
  /** サイト名（既定 OUTREACH_SITE_NAME） */
  siteName?: string;
}

const jstDate = (d: Date) => new Date(d.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);

/** 掲載案内のメール（日本語）。掲載予定の内容・事前入力リンク・送信者情報・受信拒否の方法を必ず含める */
export function buildOutreachMessage({ extract, sender, inviteUrl, optOutUrl, inviteExpiresAt, siteName = OUTREACH_SITE_NAME }: OutreachMessageInput): {
  subject: string;
  text: string;
} {
  const name = extract.name.ja ?? extract.name.en ?? '';
  const prefecture = PREFECTURES.find((p) => p.code === extract.prefecture)?.ja ?? extract.prefecture;
  const address = extract.address?.ja ?? extract.address?.en;
  const languages = extract.supportedLanguages.map((l) => LANGUAGE_LABELS_JA[l] ?? l).join('、');
  const rows: [string, string | undefined][] = [
    ['名称', name],
    ['カテゴリ', CATEGORY_LABELS_JA[extract.category]],
    ['所在地', [prefecture, extract.city, address].filter(Boolean).join(' ')],
    ['電話番号', extract.phone],
    ['Web サイト', extract.websiteUrl],
    ['対応言語', languages || '（未確認）'],
  ];
  const lines = [
    `${name} ご担当者様`,
    '',
    `突然のご連絡失礼いたします。在日外国人が外国語で利用できるサービスを探せるサイト「${siteName}」を運営している${sender.name}です。`,
    '貴社が Web サイトで公表されている連絡先あてに、掲載のご案内をお送りしています。',
    '',
    '公開情報をもとに、以下の内容での掲載を検討しています。ご承諾いただける場合は、下記のリンクから掲載申請フォームを開き、内容（特に対応言語）をご確認・修正のうえお申し込みください。ご承諾をいただくまで、この内容は公開しません。',
    '',
    '■ 掲載予定の内容',
    ...rows.filter(([, v]) => v).map(([k, v]) => `・${k}: ${v}`),
    '',
    '■ 掲載申請フォーム（内容が入力された状態で開きます）',
    inviteUrl,
    `（リンクの有効期限: ${jstDate(inviteExpiresAt)}）`,
    '',
    '■ 今後のご案内が不要な場合（受信拒否）',
    '以下のページから受信拒否の手続きができます。手続き後は、このアドレスへご案内をお送りしません。',
    optOutUrl,
    '',
    '■ 送信者',
    sender.name,
    `住所: ${sender.address}`,
    `連絡先: ${sender.contact}`,
  ];
  return { subject: `【${siteName}】掲載のご案内（${name}）`, text: lines.join('\n') };
}
