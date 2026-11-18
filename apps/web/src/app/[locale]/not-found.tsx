import { NotFoundMessage } from '../../components/NotFoundMessage';
import { notFoundMessages } from '../../lib/notFound';

/**
 * /[locale] 配下の 404。[locale] レイアウト内で描画されるため html lang・ヘッダー・フッターが付く。
 * not-found は params を受け取れないため、全言語の文言（数行）を渡してクライアント側で URL のロケールを選ぶ
 */
export default function LocaleNotFound() {
  return <NotFoundMessage messages={notFoundMessages()} />;
}
