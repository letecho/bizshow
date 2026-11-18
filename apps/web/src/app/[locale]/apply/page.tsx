import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isSupportedLocale } from '@fss/shared/domain';
import { ApplyForm } from '../../../components/ApplyForm';
import { getDictionary } from '../../../i18n/dictionaries';
import styles from './page.module.css';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) return {};
  const dict = getDictionary(locale);
  return { title: `${dict.apply.title} | ${dict.site.title}` };
}

export default async function ApplyPage({ params }: Props) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const dict = getDictionary(locale);

  return (
    <main className={styles.main}>
      <h1>{dict.apply.title}</h1>
      <p>{dict.apply.lead}</p>
      <ApplyForm locale={locale} dict={dict} />
    </main>
  );
}
