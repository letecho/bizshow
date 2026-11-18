import { SUPPORTED_LOCALES, type SupportedLocale } from '@fss/shared/domain';
import { NotFoundMessage } from '../../components/NotFoundMessage';
import { getDictionary, type Dictionary } from '../../i18n/dictionaries';

/**
 * /[locale] 配下の 404。[locale] レイアウト内で描画されるため html lang・ヘッダー・フッターが付く。
 * not-found は params を受け取れないため、全言語の文言（数行）を渡してクライアント側で URL のロケールを選ぶ
 */
export default function LocaleNotFound() {
  const messages = Object.fromEntries(SUPPORTED_LOCALES.map((l) => [l, getDictionary(l).notFound])) as Record<
    SupportedLocale,
    Dictionary['notFound']
  >;
  return <NotFoundMessage messages={messages} />;
}
