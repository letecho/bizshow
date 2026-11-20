import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isSupportedLocale } from '@fss/shared/domain';
import { ApplyForm } from '../../../components/ApplyForm';
import { getDictionary } from '../../../i18n/dictionaries';
import { getCategories, getListingInvite } from '../../../lib/api';
import styles from './page.module.css';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) return {};
  const dict = getDictionary(locale);
  const invite = (await searchParams)?.invite;
  // 案内リンク（トークン付き URL）は検索エンジンに載せない
  return { title: `${dict.apply.title} | ${dict.site.title}`, ...(invite && { robots: { index: false, follow: false } }) };
}

export default async function ApplyPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const dict = getDictionary(locale);
  // 掲載案内（F-118）のリンクから来たときは候補の内容を事前入力する
  const raw = (await searchParams)?.invite;
  const token = Array.isArray(raw) ? raw[0] : raw;
  const [invite, categories] = await Promise.all([token ? getListingInvite(token) : undefined, getCategories()]);
  const initial = invite?.ok ? invite.value.data : undefined;

  return (
    <main className={styles.main}>
      <h1>{dict.apply.title}</h1>
      <p>{dict.apply.lead}</p>
      {invite && (
        <p role="status" className={styles.notice}>
          {initial ? dict.apply.inviteLoaded : dict.apply.inviteInvalid}
        </p>
      )}
      <ApplyForm locale={locale} dict={dict} initial={initial} categories={categories} />
    </main>
  );
}
