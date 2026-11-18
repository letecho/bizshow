'use client';

import { useParams } from 'next/navigation';
import { isSupportedLocale, type SupportedLocale } from '@fss/shared/domain';
import type { Dictionary } from '../i18n/dictionaries';
import styles from './NotFoundMessage.module.css';

export function NotFoundMessage({ messages }: { messages: Record<SupportedLocale, Dictionary['notFound']> }) {
  const params = useParams<{ locale?: string }>();
  const locale: SupportedLocale = params?.locale && isSupportedLocale(params.locale) ? params.locale : 'en';
  const t = messages[locale];
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>{t.title}</h1>
      <p className={styles.body}>{t.body}</p>
      <a href={`/${locale}`} className={styles.back}>
        {t.back}
      </a>
    </main>
  );
}
