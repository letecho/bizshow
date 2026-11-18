import { notFound } from 'next/navigation';
import { isSupportedLocale } from '@fss/shared/domain';
import { Pagination } from '../../components/Pagination';
import { SearchForm } from '../../components/SearchForm';
import { ServiceCard } from '../../components/ServiceCard';
import { getDictionary } from '../../i18n/dictionaries';
import { format } from '../../i18n/labels';
import { searchServices, toQueryString } from '../../lib/api';
import styles from './page.module.css';

type SearchParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function HomePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const dict = getDictionary(locale);
  const sp = await searchParams;
  const query = toQueryString(sp);
  const result = await searchServices(query);

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>{dict.site.title}</h1>
      <p className={styles.lead}>{dict.home.lead}</p>

      <SearchForm
        locale={locale}
        dict={dict}
        values={{ q: first(sp.q), category: first(sp.category), prefecture: first(sp.prefecture), lang: first(sp.lang) }}
      />

      <section className={styles.results} aria-live="polite">
        {!result.ok ? (
          <p role="alert" className={styles.error}>
            {dict.search.error}
          </p>
        ) : result.value.data.length === 0 ? (
          <p className={styles.empty}>{dict.search.empty}</p>
        ) : (
          <>
            <p className={styles.count}>{format(dict.search.results, { total: result.value.meta.total })}</p>
            <div className={styles.grid}>
              {result.value.data.map((service) => (
                <ServiceCard key={service.id} service={service} locale={locale} dict={dict} />
              ))}
            </div>
            <Pagination
              basePath={`/${locale}`}
              query={query}
              page={result.value.meta.page}
              limit={result.value.meta.limit}
              total={result.value.meta.total}
              labels={{ prev: dict.search.prev, next: dict.search.next }}
            />
          </>
        )}
      </section>
    </main>
  );
}
