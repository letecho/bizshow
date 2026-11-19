import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type SupportedLocale } from '@fss/shared/domain';

export const locales = SUPPORTED_LOCALES;
export const defaultLocale = DEFAULT_LOCALE;
export type { SupportedLocale };

/** 言語切替に表示する各言語の自称 */
export const localeNames: Record<SupportedLocale, string> = {
  ja: '日本語',
  en: 'English',
  vi: 'Tiếng Việt',
};

/** パス先頭の locale を差し替える（/ja/services/x → /vi/services/x） */
export function switchLocalePath(pathname: string, locale: SupportedLocale): string {
  const segments = pathname.split('/');
  segments[1] = locale;
  return segments.join('/') || `/${locale}`;
}
