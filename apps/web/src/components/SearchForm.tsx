import { PREFECTURES, SERVICE_CATEGORIES, type SupportedLocale } from '@fss/shared/domain';
import type { Dictionary } from '../i18n/dictionaries';
import { localeNames, locales } from '../i18n/config';
import { prefectureName } from '../i18n/labels';
import styles from './SearchForm.module.css';

export interface SearchValues {
  q?: string;
  category?: string;
  prefecture?: string;
  lang?: string;
}

/** GET フォーム。送信すると条件が URL クエリに反映される（page は 1 に戻る） */
export function SearchForm({
  locale,
  dict,
  values,
}: {
  locale: SupportedLocale;
  dict: Dictionary;
  values: SearchValues;
}) {
  const t = dict.search;
  return (
    <form method="get" action={`/${locale}`} className={styles.form} role="search">
      <label className={styles.field}>
        <span>{t.keyword}</span>
        <input type="search" name="q" defaultValue={values.q} maxLength={100} placeholder={t.keywordPlaceholder} />
      </label>
      <label className={styles.field}>
        <span>{t.category}</span>
        <select name="category" defaultValue={values.category ?? ''}>
          <option value="">{t.any}</option>
          {SERVICE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {dict.categories[c]}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.field}>
        <span>{t.prefecture}</span>
        <select name="prefecture" defaultValue={values.prefecture ?? ''}>
          <option value="">{t.any}</option>
          {PREFECTURES.map((p) => (
            <option key={p.code} value={p.code}>
              {prefectureName(p.code, locale)}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.field}>
        <span>{t.language}</span>
        <select name="lang" defaultValue={values.lang ?? ''}>
          <option value="">{t.any}</option>
          {locales.map((l) => (
            <option key={l} value={l}>
              {localeNames[l]}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className={styles.submit}>
        {t.submit}
      </button>
    </form>
  );
}
