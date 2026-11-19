import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { marked } from 'marked';
import { SUPPORTED_LOCALES, isSupportedLocale } from '@fss/shared/domain';
import { getDictionary } from '../../../i18n/dictionaries';
import { loadBotDocument } from '../../../lib/bot';
import styles from '../legal/[page]/page.module.css';

// ボット説明ページ（F-116）。本文はリポジトリ内の Markdown のみ。ビルド時に全言語を静的生成する
export const dynamicParams = false;

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) return {};
  const dict = getDictionary(locale);
  return { title: `${dict.bot.title} | ${dict.site.title}` };
}

export default async function BotPage({ params }: Props) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();

  const doc = await loadBotDocument(locale);
  // 信頼できるリポジトリ内コンテンツのみを HTML 化する（ユーザー入力は扱わない）
  const html = await marked.parse(doc.markdown);

  return (
    <main className={styles.main}>
      <article lang={doc.locale} className={styles.article} dangerouslySetInnerHTML={{ __html: html }} />
    </main>
  );
}
