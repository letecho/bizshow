'use client';

import { startTransition, useActionState, useState, type FormEvent, type ReactNode } from 'react';
import {
  LISTING_TEXT_MAX,
  PREFECTURES,
  SERVICE_CATEGORIES,
  SLUG_MAX,
  type AdminService,
  type SupportedLocale,
} from '@fss/shared/domain';
import type { FormState } from '../../app/admin/actions';
import { localeNames, locales } from '../../i18n/config';
import en from '../../i18n/dictionaries/en.json';
import formStyles from '../Form.module.css';
import { ImageField } from './ImageField';
import styles from '../../app/admin/admin.module.css';

/** 掲載の作成・編集フォーム。名前・説明・住所は言語タブで切替（en 必須）。全タブの入力が送信される */
export function ServiceForm({
  action,
  service,
  submitLabel = '保存',
  children,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  /** 初期値（掲載の編集、または候補の承認で抽出値から作った値） */
  service?: Partial<AdminService>;
  submitLabel?: string;
  /** 送信ボタンの前に追加する入力（候補の承認で事業者の種類の確認など） */
  children?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  // form の action 属性に渡すと React 19 が送信後に入力をリセットするため、エラー時に入力を残せるよう onSubmit で呼ぶ
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(() => formAction(form));
  };
  const [tab, setTab] = useState<SupportedLocale>('en');

  return (
    <form onSubmit={onSubmit} className={formStyles.form}>
      <div className={styles.grid}>
        <label className={formStyles.field}>
          <span>slug *</span>
          <input name="slug" required maxLength={SLUG_MAX} defaultValue={service?.slug} placeholder="tokyo-visa-office" />
        </label>
        <label className={formStyles.field}>
          <span>カテゴリ *</span>
          <select name="category" required defaultValue={service?.category ?? ''}>
            <option value="" disabled>
              —
            </option>
            {SERVICE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}（{en.categories[c]}）
              </option>
            ))}
          </select>
        </label>
        <label className={formStyles.field}>
          <span>都道府県 *</span>
          <select name="prefecture" required defaultValue={service?.prefecture ?? ''}>
            <option value="" disabled>
              —
            </option>
            {PREFECTURES.map((p) => (
              <option key={p.code} value={p.code}>
                {p.ja}
              </option>
            ))}
          </select>
        </label>
        <label className={formStyles.field}>
          <span>市区町村</span>
          <input name="city" maxLength={LISTING_TEXT_MAX.city} defaultValue={service?.city ?? ''} />
        </label>
        <label className={formStyles.field}>
          <span>電話</span>
          <input name="phone" type="tel" maxLength={LISTING_TEXT_MAX.phone} defaultValue={service?.phone ?? ''} />
        </label>
        <label className={formStyles.field}>
          <span>Web サイト</span>
          <input
            name="websiteUrl"
            type="url"
            maxLength={LISTING_TEXT_MAX.websiteUrl}
            defaultValue={service?.websiteUrl ?? ''}
            placeholder="https://"
          />
        </label>
      </div>

      <fieldset className={formStyles.fieldset}>
        <legend>対応言語 *</legend>
        <div className={formStyles.checks}>
          {locales.map((l) => (
            <label key={l}>
              <input
                type="checkbox"
                name="supportedLanguages"
                value={l}
                defaultChecked={service?.supportedLanguages?.includes(l)}
              />{' '}
              {localeNames[l]}
            </label>
          ))}
        </div>
      </fieldset>

      <div role="tablist" className={styles.tabs}>
        {locales.map((l) => (
          <button
            key={l}
            type="button"
            role="tab"
            aria-selected={tab === l}
            className={tab === l ? styles.tabActive : styles.tab}
            onClick={() => setTab(l)}
          >
            {localeNames[l]}
            {l === 'en' ? ' *' : ''}
          </button>
        ))}
      </div>
      {locales.map((l) => (
        <div key={l} role="tabpanel" hidden={tab !== l} className={formStyles.form}>
          <label className={formStyles.field}>
            <span>サービス名（{l}）{l === 'en' ? ' *' : ''}</span>
            <input name={`name_${l}`} maxLength={LISTING_TEXT_MAX.name} defaultValue={service?.name?.[l] ?? ''} />
          </label>
          <label className={formStyles.field}>
            <span>説明（{l}）{l === 'en' ? ' *' : ''}</span>
            <textarea
              name={`description_${l}`}
              rows={6}
              maxLength={LISTING_TEXT_MAX.description}
              defaultValue={service?.description?.[l] ?? ''}
            />
          </label>
          <label className={formStyles.field}>
            <span>住所（{l}）</span>
            <input
              name={`address_${l}`}
              maxLength={LISTING_TEXT_MAX.address}
              defaultValue={service?.address?.[l] ?? ''}
            />
          </label>
        </div>
      ))}

      <ImageField initialKey={service?.imageKey} initialUrl={service?.imageUrl} />

      <label>
        <input type="checkbox" name="isPublished" defaultChecked={service?.isPublished ?? false} /> 公開する
      </label>
      {children}
      {state.error && (
        <p role="alert" className={formStyles.error}>
          {state.error}
        </p>
      )}
      <button type="submit" className={formStyles.submit} disabled={pending}>
        {pending ? '保存中…' : submitLabel}
      </button>
    </form>
  );
}
