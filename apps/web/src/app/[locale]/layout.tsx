import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isSupportedLocale } from '@fss/shared/domain';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';
import { getDictionary } from '../../i18n/dictionaries';
import { locales } from '../../i18n/config';
import styles from './layout.module.css';

// 対応言語以外（/fr など）は 404
export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) return {};
  const dict = getDictionary(locale);
  return { title: dict.site.title, description: dict.site.description };
}

export default async function LocaleLayout({ children, params }: Props & { children: React.ReactNode }) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const dict = getDictionary(locale);

  return (
    <html lang={locale}>
      <body className={styles.body}>
        <header className={styles.header}>
          <a href={`/${locale}`} className={styles.brand}>
            {dict.site.title}
          </a>
          <LanguageSwitcher current={locale} label={dict.header.language} />
        </header>
        {children}
      </body>
    </html>
  );
}
