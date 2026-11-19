import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isSupportedLocale } from '@fss/shared/domain';
import { ContactForm } from '../../../components/ContactForm';
import { getDictionary } from '../../../i18n/dictionaries';
import { listingReportMessage } from '../../../lib/listingReport';
import styles from './page.module.css';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) return {};
  const dict = getDictionary(locale);
  return { title: `${dict.contact.title} | ${dict.site.title}` };
}

export default async function ContactPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const t = getDictionary(locale).contact;
  // 掲載詳細の「修正・削除を依頼」から来たときは件名と slug を本文の初期値にする（F-116）
  const initialMessage = listingReportMessage((await searchParams) ?? {}, t.listingTopic);

  return (
    <main className={styles.main}>
      <h1>{t.title}</h1>
      <p>{t.lead}</p>
      <ContactForm locale={locale} t={t} initialMessage={initialMessage} />
    </main>
  );
}
