import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isSupportedLocale } from '@fss/shared/domain';
import { OptOutForm } from '../../../../components/OptOutForm';
import { getDictionary } from '../../../../i18n/dictionaries';
import styles from './page.module.css';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) return {};
  const dict = getDictionary(locale);
  return { title: `${dict.optOut.title} | ${dict.site.title}`, robots: { index: false, follow: false } };
}

/** 掲載案内メール（F-118）の受信拒否。メールのリンク（署名付きトークン）から開き、ボタンで確定する */
export default async function OptOutPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const t = getDictionary(locale).optOut;
  const raw = (await searchParams)?.token;
  const token = (Array.isArray(raw) ? raw[0] : raw) ?? '';

  return (
    <main className={styles.main}>
      <h1>{t.title}</h1>
      <p>{t.lead}</p>
      <OptOutForm token={token} t={t} />
    </main>
  );
}
