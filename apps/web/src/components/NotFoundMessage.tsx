'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { isSupportedLocale, type SupportedLocale } from '@fss/shared/domain';
import type { NotFoundMessages } from '../lib/notFound';
import styles from './NotFoundMessage.module.css';

export function NotFoundMessage({ messages }: { messages: Record<SupportedLocale, NotFoundMessages> }) {
  const params = useParams<{ locale?: string }>();
  const locale: SupportedLocale = params?.locale && isSupportedLocale(params.locale) ? params.locale : 'en';
  const t = messages[locale];

  // not-found はロケール別の metadata を持てないため、404 であることが分かるタイトルをここで設定する（B-007）
  useEffect(() => {
    document.title = t.documentTitle;
  }, [t.documentTitle]);

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
