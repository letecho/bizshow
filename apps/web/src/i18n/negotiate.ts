import { SUPPORTED_LOCALES, DEFAULT_LOCALE, type SupportedLocale } from '@fss/shared/domain';

/**
 * Accept-Language ヘッダーから対応言語の最適一致を返す。
 * q 値の高い順に、言語タグの主言語（vi-VN → vi）で照合。一致なしは en。
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): SupportedLocale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const ranked = acceptLanguage
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      return { lang: tag.trim().toLowerCase().split('-')[0], q: q ? Number(q.slice(2)) : 1, index };
    })
    .filter((x) => x.lang && !Number.isNaN(x.q) && x.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  const match = ranked.find((x) => (SUPPORTED_LOCALES as readonly string[]).includes(x.lang));
  return (match?.lang as SupportedLocale | undefined) ?? DEFAULT_LOCALE;
}
