import { PREFECTURES, pickText, type Category, type SupportedLocale } from '@fss/shared/domain';
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
  categories,
}: {
  locale: SupportedLocale;
  dict: Dictionary;
  values: SearchValues;
  /** GET /api/v1/categories（F-121）。取得できなかったときは空でカテゴリの選択を出さない */
  categories: Category[];
}) {
  const t = dict.search;
  return (
    <form method="get" action={`/${locale}`} className={styles.form} role="search">
      <label className={styles.field}>
        <span>{t.keyword}</span>
        <input type="search" name="q" defaultValue={values.q} maxLength={100} placeholder={t.keywordPlaceholder} />
      </label>
      {categories.length > 0 ? (
        <label className={styles.field}>
          <span>{t.category}</span>
          <select name="category" defaultValue={values.category ?? ''}>
            <option value="">{t.any}</option>
            {categories.map((c) => (
              <option key={c.code} value={c.code}>
                {pickText(c.name, locale)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        // カテゴリ一覧を取得できないときも、指定中の条件は次の検索に引き継ぐ
        values.category && <input type="hidden" name="category" value={values.category} />
      )}
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
