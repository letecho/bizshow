import { SlugSchema, type SupportedLocale } from '@fss/shared/domain';

// F-116: 掲載情報の修正・削除の依頼（お問い合わせフォームに件名と slug を渡す。新しい保存先は作らない）

export const LISTING_REPORT_TOPIC = 'listing';

/** 詳細ページ → お問い合わせのリンク */
export function listingReportHref(locale: SupportedLocale, slug: string): string {
  const params = new URLSearchParams({ topic: LISTING_REPORT_TOPIC, slug });
  return `/${locale}/contact?${params.toString()}`;
}

/**
 * お問い合わせのクエリから本文の初期値を作る。topic=listing と正しい形式の slug のときだけ
 * 「件名 + slug」を返し、それ以外（不正な slug を含む）は空にする。
 */
export function listingReportMessage(
  params: Record<string, string | string[] | undefined>,
  topicLabel: string,
): string {
  if (params.topic !== LISTING_REPORT_TOPIC) return '';
  const slug = SlugSchema.safeParse(params.slug);
  if (!slug.success) return '';
  return `${topicLabel}\nslug: ${slug.data}\n\n`;
}

const DATE_LOCALES: Record<SupportedLocale, string> = { ja: 'ja-JP', en: 'en-US', vi: 'vi-VN' };

/** 最終確認日の表示（日本時間の日付） */
export function formatVerifiedDate(iso: string, locale: SupportedLocale): string {
  return new Intl.DateTimeFormat(DATE_LOCALES[locale], { dateStyle: 'long', timeZone: 'Asia/Tokyo' }).format(new Date(iso));
}
