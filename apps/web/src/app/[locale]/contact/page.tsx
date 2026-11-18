import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isSupportedLocale } from '@fss/shared/domain';
import { ContactForm } from '../../../components/ContactForm';
import { getDictionary } from '../../../i18n/dictionaries';
import styles from './page.module.css';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) return {};
  const dict = getDictionary(locale);
  return { title: `${dict.contact.title} | ${dict.site.title}` };
}

export default async function ContactPage({ params }: Props) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const t = getDictionary(locale).contact;

  return (
    <main className={styles.main}>
      <h1>{t.title}</h1>
      <p>{t.lead}</p>
      <ContactForm locale={locale} t={t} />
    </main>
  );
}
