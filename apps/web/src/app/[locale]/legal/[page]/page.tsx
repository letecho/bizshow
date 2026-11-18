import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { marked } from 'marked';
import { SUPPORTED_LOCALES, isSupportedLocale } from '@fss/shared/domain';
import { getDictionary } from '../../../../i18n/dictionaries';
import { LEGAL_PAGES, isLegalPage, loadLegalDocument } from '../../../../lib/legal';
import styles from './page.module.css';

// 本文はリポジトリ内の Markdown のみ。ビルド時に全言語×全ページを静的生成する
export const dynamicParams = false;

export function generateStaticParams() {
  return SUPPORTED_LOCALES.flatMap((locale) => LEGAL_PAGES.map((page) => ({ locale, page })));
}

type Props = { params: Promise<{ locale: string; page: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, page } = await params;
  if (!isSupportedLocale(locale) || !isLegalPage(page)) return {};
  const dict = getDictionary(locale);
  return { title: `${dict.legal[page]} | ${dict.site.title}` };
}

export default async function LegalPage({ params }: Props) {
  const { locale, page } = await params;
  if (!isSupportedLocale(locale) || !isLegalPage(page)) notFound();

  const doc = await loadLegalDocument(page, locale);
  // 信頼できるリポジトリ内コンテンツのみを HTML 化する（ユーザー入力は扱わない）
  const html = await marked.parse(doc.markdown);

  return (
    <main className={styles.main}>
      <article lang={doc.locale} className={styles.article} dangerouslySetInnerHTML={{ __html: html }} />
    </main>
  );
}
