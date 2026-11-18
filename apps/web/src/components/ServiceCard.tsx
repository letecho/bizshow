import { pickText, type ServiceSummary, type SupportedLocale } from '@fss/shared/domain';
import type { Dictionary } from '../i18n/dictionaries';
import { localeNames } from '../i18n/config';
import { prefectureName } from '../i18n/labels';
import styles from './ServiceCard.module.css';

export function ServiceCard({
  service,
  locale,
  dict,
}: {
  service: ServiceSummary;
  locale: SupportedLocale;
  dict: Dictionary;
}) {
  return (
    <article className={styles.card}>
      <h2 className={styles.name}>{pickText(service.name, locale)}</h2>
      <p className={styles.meta}>
        {dict.categories[service.category] ?? service.category} · {prefectureName(service.prefecture, locale)}
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
