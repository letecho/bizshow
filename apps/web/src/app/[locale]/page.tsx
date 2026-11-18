import { notFound } from 'next/navigation';
import { isSupportedLocale } from '@fss/shared/domain';
import { getDictionary } from '../../i18n/dictionaries';
import styles from './page.module.css';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const dict = getDictionary(locale);

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>{dict.site.title}</h1>
      <p className={styles.lead}>{dict.home.lead}</p>
    </main>
  );
}
