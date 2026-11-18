'use client';

import { usePathname } from 'next/navigation';
import { localeNames, locales, switchLocalePath, type SupportedLocale } from '../i18n/config';
import styles from './LanguageSwitcher.module.css';

/** 同じページのまま言語だけを切り替える */
export function LanguageSwitcher({ current, label }: { current: SupportedLocale; label: string }) {
  const pathname = usePathname() ?? `/${current}`;
  return (
    <nav aria-label={label} className={styles.nav}>
      {locales.map((locale) =>
        locale === current ? (
          <span key={locale} className={styles.current} aria-current="true" lang={locale}>
            {localeNames[locale]}
          </span>
        ) : (
          <a key={locale} href={switchLocalePath(pathname, locale)} hrefLang={locale} lang={locale} className={styles.link}>
            {localeNames[locale]}
          </a>
        ),
      )}
    </nav>
  );
}
