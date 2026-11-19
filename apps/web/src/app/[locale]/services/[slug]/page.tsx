import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isSupportedLocale, pickText } from '@fss/shared/domain';
import { getDictionary } from '../../../../i18n/dictionaries';
import { localeNames } from '../../../../i18n/config';
import { prefectureName } from '../../../../i18n/labels';
import { getService } from '../../../../lib/api';
import { formatVerifiedDate, listingReportHref } from '../../../../lib/listingReport';
import { googleMapsSearchUrl } from '../../../../lib/mapLink';
import styles from './page.module.css';

type Props = { params: Promise<{ locale: string; slug: string }> };

// generateMetadata と本体で同じ API 呼び出しを1回にまとめる
const loadService = cache(getService);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isSupportedLocale(locale)) return {};
  const result = await loadService(slug);
  if (!result.ok) return { title: getDictionary(locale).site.title };
  const service = result.value.data;
  return {
    title: `${pickText(service.name, locale)} | ${getDictionary(locale).site.title}`,
    description: pickText(service.description, locale),
  };
}

export default async function ServiceDetailPage({ params }: Props) {
  const { locale, slug } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const dict = getDictionary(locale);
  const t = dict.detail;

  const result = await loadService(slug);
  if (!result.ok && result.status === 404) notFound();
  const mapUrl =
    result.ok && result.value.data.address
      ? googleMapsSearchUrl(pickText(result.value.data.name, locale), pickText(result.value.data.address, locale))
      : null;

  return (
    <main className={styles.main}>
      <p>
        <a href={`/${locale}`} className={styles.back}>
          ← {t.back}
        </a>
      </p>
      {!result.ok ? (
        <p role="alert" className={styles.error}>
          {t.error}
        </p>
      ) : (
        <article className={styles.card}>
          {result.value.data.imageUrl && (
            // 画像は CDN 配信のため next/image の最適化（remotePatterns 設定）は使わない
            <img
              src={result.value.data.imageUrl}
              alt={pickText(result.value.data.name, locale)}
              className={styles.image}
            />
          )}
          <h1 className={styles.name}>{pickText(result.value.data.name, locale)}</h1>
          <p className={styles.description}>{pickText(result.value.data.description, locale)}</p>
          <dl className={styles.list}>
            <dt>{t.category}</dt>
            <dd>{dict.categories[result.value.data.category] ?? result.value.data.category}</dd>
            <dt>{t.area}</dt>
            <dd>
              {prefectureName(result.value.data.prefecture, locale)}
              {result.value.data.city ? ` ${result.value.data.city}` : ''}
            </dd>
            {result.value.data.address && (
              <>
                <dt>{t.address}</dt>
                <dd>
                  {pickText(result.value.data.address, locale)}
                  {mapUrl && (
                    <a href={mapUrl} target="_blank" rel="noopener noreferrer" className={styles.mapLink}>
                      {t.openInMap}
                    </a>
                  )}
                </dd>
              </>
            )}
            {result.value.data.phone && (
              <>
                <dt>{t.phone}</dt>
                <dd>
                  <a href={`tel:${result.value.data.phone.replace(/[^\d+]/g, '')}`}>{result.value.data.phone}</a>
                </dd>
              </>
            )}
            {result.value.data.websiteUrl && (
              <>
                <dt>{t.website}</dt>
                <dd>
                  <a href={result.value.data.websiteUrl} target="_blank" rel="noopener noreferrer">
                    {result.value.data.websiteUrl}
                  </a>
                </dd>
              </>
            )}
            <dt>{t.languages}</dt>
            <dd>
              <ul className={styles.badges}>
                {result.value.data.supportedLanguages.map((l) => (
                  <li key={l} className={styles.badge} lang={l}>
                    {localeNames[l] ?? l}
                  </li>
                ))}
              </ul>
            </dd>
            {result.value.data.sources.length > 0 && (
              <>
                <dt>{t.sources}</dt>
                <dd>
                  <ul className={styles.sources}>
                    {result.value.data.sources.map((source) => (
                      <li key={`${source.attribution}|${source.url ?? ''}`}>
                        {source.url ? (
                          <a href={source.url} target="_blank" rel="noopener noreferrer">
                            {source.attribution}
                          </a>
                        ) : (
                          source.attribution
                        )}
                      </li>
                    ))}
                  </ul>
                </dd>
              </>
            )}
            {result.value.data.lastVerifiedAt && (
              <>
                <dt>{t.lastVerified}</dt>
                <dd>
                  <time dateTime={result.value.data.lastVerifiedAt}>
                    {formatVerifiedDate(result.value.data.lastVerifiedAt, locale)}
                  </time>
                </dd>
              </>
            )}
          </dl>
          <p className={styles.report}>
            <a href={listingReportHref(locale, result.value.data.slug)}>{t.reportListing}</a>
          </p>
        </article>
      )}
    </main>
  );
}

