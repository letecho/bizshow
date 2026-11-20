import { categoryName, pickText, type Category, type ServiceSummary, type SupportedLocale } from '@fss/shared/domain';
import type { Dictionary } from '../i18n/dictionaries';
import { localeNames } from '../i18n/config';
import { prefectureName } from '../i18n/labels';
import styles from './ServiceCard.module.css';

export function ServiceCard({
  service,
  locale,
  dict,
  categories,
}: {
  service: ServiceSummary;
  /** カテゴリ名の表示用（F-121）。先頭のカテゴリ（主カテゴリ）を出す */
  categories: Category[];
  locale: SupportedLocale;
  dict: Dictionary;
}) {
  return (
    <article className={styles.card}>
      <h2 className={styles.name}>{pickText(service.name, locale)}</h2>
      <p className={styles.meta}>
        {service.categories[0] && `${categoryName(categories, service.categories[0], locale)} · `}
        {prefectureName(service.prefecture, locale)}
      </p>
      <ul className={styles.badges} aria-label={dict.search.language}>
        {service.supportedLanguages.map((l) => (
          <li key={l} className={styles.badge} lang={l}>
            {localeNames[l] ?? l}
          </li>
        ))}
      </ul>
      <a href={`/${locale}/services/${service.slug}`} className={styles.link}>
        {dict.search.details}
      </a>
    </article>
  );
}
