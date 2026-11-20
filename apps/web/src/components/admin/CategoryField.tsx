'use client';

import { useState, useTransition } from 'react';
import {
  CATEGORY_CODE_MAX,
  CATEGORY_NAME_MAX,
  LISTING_CATEGORIES_MAX,
  pickText,
  type Category,
} from '@fss/shared/domain';
import { createCategory } from '../../app/admin/actions';
import formStyles from '../Form.module.css';

const NAME_FIELDS = [
  { locale: 'en', label: 'English *' },
  { locale: 'ja', label: '日本語' },
  { locale: 'vi', label: 'Tiếng Việt' },
] as const;

type NameInput = Record<(typeof NAME_FIELDS)[number]['locale'], string>;
const EMPTY_NAME: NameInput = { en: '', ja: '', vi: '' };

/**
 * 掲載フォームのカテゴリ（F-121）。チェックボックスで 1〜5 個を選び、選んだ順に送信する（先頭が主カテゴリ）。
 * 「カテゴリを追加」で新しいカテゴリを作成すると、一覧に加わり選択済みになる（掲載フォームの入力はそのまま）
 */
export function CategoryField({ categories: initial, selected: initialSelected = [] }: { categories: Category[]; selected?: string[] }) {
  const [categories, setCategories] = useState(initial);
  const [selected, setSelected] = useState(initialSelected);
  const [code, setCode] = useState('');
  const [name, setName] = useState<NameInput>(EMPTY_NAME);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const full = selected.length >= LISTING_CATEGORIES_MAX;

  const toggle = (value: string, checked: boolean) =>
    setSelected((current) => (checked ? [...current, value] : current.filter((c) => c !== value)));

  const label = (value: string) => {
    const category = categories.find((c) => c.code === value);
    return category ? `${pickText(category.name, 'ja')}（${value}）` : value;
  };

  const add = () => {
    setError(null);
    setAdded(null);
    startTransition(async () => {
      const result = await createCategory({ code, name });
      if ('error' in result) {
        setError(result.error);
        return;
      }
      setCategories((current) => [...current, result.category]);
      if (selected.length < LISTING_CATEGORIES_MAX) setSelected((current) => [...current, result.category.code]);
      setAdded(`カテゴリ「${pickText(result.category.name, 'ja')}」を追加しました。`);
      setCode('');
      setName(EMPTY_NAME);
    });
  };

  return (
    <fieldset className={formStyles.fieldset}>
      <legend>カテゴリ *</legend>
      <div className={formStyles.stack}>
        <p className={formStyles.hint}>
          {LISTING_CATEGORIES_MAX} 個まで選べます。最初に選んだカテゴリが主カテゴリ（検索結果のカードに表示）になります。
        </p>
        {categories.length === 0 ? (
          <p role="alert" className={formStyles.error}>
            カテゴリの一覧を取得できませんでした。再読み込みしてください。
          </p>
        ) : (
          <div className={formStyles.checks}>
            {categories.map((c) => {
              const checked = selected.includes(c.code);
              return (
                <label key={c.code}>
                  <input
                    type="checkbox"
                    value={c.code}
                    checked={checked}
                    disabled={!checked && full}
                    onChange={(e) => toggle(c.code, e.target.checked)}
                  />{' '}
                  {pickText(c.name, 'ja')}（{c.code}）
                </label>
              );
            })}
          </div>
        )}
        {/* 選んだ順に送る（チェックボックスは並び順のため name を付けない） */}
        {selected.map((value) => (
          <input key={value} type="hidden" name="categories" value={value} />
        ))}
        <p aria-live="polite" className={formStyles.hint}>
          {selected.length > 0 ? `選択中: ${selected.map(label).join(' → ')}` : '未選択'}
        </p>

        <details>
          <summary>カテゴリを追加</summary>
          <div className={formStyles.form}>
            <label className={formStyles.field}>
              <span>コード *（英小文字・数字・ハイフン）</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={CATEGORY_CODE_MAX}
                placeholder="pets"
                autoCapitalize="none"
                spellCheck={false}
              />
            </label>
            {NAME_FIELDS.map((f) => (
              <label key={f.locale} className={formStyles.field}>
                <span>名前（{f.label}）</span>
                <input
                  lang={f.locale}
                  value={name[f.locale]}
                  onChange={(e) => setName((current) => ({ ...current, [f.locale]: e.target.value }))}
                  maxLength={CATEGORY_NAME_MAX}
                />
              </label>
            ))}
            {error && (
              <p role="alert" className={formStyles.error}>
                {error}
              </p>
            )}
            {added && <p role="status">{added}</p>}
            <button type="button" className={formStyles.submit} onClick={add} disabled={pending}>
              {pending ? '追加中…' : 'このカテゴリを追加'}
            </button>
          </div>
        </details>
      </div>
    </fieldset>
  );
}
