import { SUPPORTED_LOCALES, type SupportedLocale } from '@fss/shared/domain';
import { getDictionary, type Dictionary } from '../i18n/dictionaries';

export type NotFoundMessages = Dictionary['notFound'] & {
  /** 404 の <title>（「ページが見つかりません | サイト名」） */
  documentTitle: string;
};

/**
 * 404 画面で使う全言語の文言。not-found は params を受け取れないため、
 * 全言語分をクライアントへ渡し URL のロケールで選ぶ（B-005 / B-007）
 */
export function notFoundMessages(): Record<SupportedLocale, NotFoundMessages> {
  return Object.fromEntries(
    SUPPORTED_LOCALES.map((locale) => {
      const dict = getDictionary(locale);
      return [locale, { ...dict.notFound, documentTitle: `${dict.notFound.title} | ${dict.site.title}` }];
    }),
  ) as Record<SupportedLocale, NotFoundMessages>;
}
