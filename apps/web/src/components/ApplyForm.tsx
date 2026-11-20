'use client';

import { useState, type FormEvent } from 'react';
import {
  LISTING_CATEGORIES_MAX,
  LISTING_TEXT_MAX,
  ListingRequestInputSchema,
  PREFECTURES,
  pickText,
  type Category,
  type SupportedLocale,
} from '@fss/shared/domain';
import type { ListingInvitePrefill } from '@fss/shared/outreach';
import type { Dictionary } from '../i18n/dictionaries';
import { localeNames, locales } from '../i18n/config';
import { format, prefectureName } from '../i18n/labels';
import { API_URL } from '../lib/api';
import { invalidFieldNames, invalidProps } from '../lib/formErrors';
import { listingFormToInput } from '../lib/listingForm';
import styles from './Form.module.css';

type Status = 'idle' | 'sending' | 'sent' | 'invalid' | 'error';
type FormState = { status: Status; invalid: string[] };

const ERROR_ID = 'apply-form-error';

/** 各言語の入力欄（en 必須） */
function LocalizedFields({
  field,
  legend,
  required,
  multiline,
  invalid,
  initial,
}: {
  field: 'name' | 'description' | 'address';
  legend: string;
  required?: boolean;
  multiline?: boolean;
  invalid: string[];
  initial?: Partial<Record<SupportedLocale, string>>;
}) {
  return (
    <fieldset className={styles.fieldset}>
      <legend>{legend}</legend>
      {locales.map((l) => (
        <label key={l} className={styles.field}>
          <span>
            {localeNames[l]}
            {required && l === 'en' ? ' *' : ''}
          </span>
          {multiline ? (
            <textarea
              name={`${field}_${l}`}
              rows={4}
              defaultValue={initial?.[l]}
              required={required && l === 'en'}
              maxLength={LISTING_TEXT_MAX[field]}
              {...invalidProps(invalid, `${field}_${l}`, ERROR_ID)}
            />
          ) : (
            <input
              name={`${field}_${l}`}
              defaultValue={initial?.[l]}
              required={required && l === 'en'}
              maxLength={LISTING_TEXT_MAX[field]}
              {...invalidProps(invalid, `${field}_${l}`, ERROR_ID)}
            />
          )}
        </label>
      ))}
    </fieldset>
  );
}

/**
 * 事業者の掲載申請フォーム。shared スキーマで事前検証し API へ送信する。
 * initial: 掲載案内のリンク（F-118）から来たときの事前入力
 */
export function ApplyForm({
  locale,
  dict,
  initial,
  categories,
}: {
  locale: SupportedLocale;
  dict: Dictionary;
  initial?: ListingInvitePrefill;
  /** 選べるカテゴリ（GET /api/v1/categories、F-121）。利用者は追加できない */
  categories: Category[];
}) {
  const t = dict.apply;
  const [{ status, invalid }, setState] = useState<FormState>({ status: 'idle', invalid: [] });
  const setStatus = (next: Status) => setState({ status: next, invalid: [] });
  const err = (name: string) => invalidProps(invalid, name, ERROR_ID);

  /** 入力欄の name → エラー文に出す項目名 */
  const labels: Record<string, string> = {
    categories: dict.search.category,
    prefecture: dict.search.prefecture,
    city: t.city,
    supportedLanguages: dict.detail.languages,
    phone: dict.detail.phone,
    websiteUrl: dict.detail.website,
    contactName: t.contactName,
    contactEmail: t.contactEmail,
  };
  for (const [field, legend] of [
    ['name', t.serviceName],
    ['description', t.description],
    ['address', dict.detail.address],
  ] as const) {
    for (const l of locales) {
      // 項目名と言語名の区切り（日本語は全角括弧）
      labels[`${field}_${l}`] =
        locale === 'ja' ? `${legend}（${localeNames[l]}）` : `${legend} (${localeNames[l]})`;
    }
  }
  const invalidLabels = invalid.map((name) => labels[name]).filter((label): label is string => !!label);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const parsed = ListingRequestInputSchema.safeParse(listingFormToInput(new FormData(form)));
    if (!parsed.success) {
      setState({ status: 'invalid', invalid: invalidFieldNames(parsed.error.issues) });
      return;
    }
    setStatus('sending');
    try {
      const res = await fetch(`${API_URL}/api/v1/listing-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      if (res.status === 201) {
        form.reset();
        setStatus('sent');
      } else {
        setStatus(res.status === 400 ? 'invalid' : 'error');
      }
    } catch {
      setStatus('error');
    }
  }

  if (status === 'sent') {
    return (
      <p role="status" className={styles.success}>
        {t.sent}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className={styles.form} noValidate>
      <p className={styles.hint}>{t.requiredHint}</p>
      <fieldset className={styles.fieldset}>
        <legend>{dict.search.category} *</legend>
        <div className={styles.stack}>
          <p className={styles.hint}>{format(t.categoriesHint, { max: LISTING_CATEGORIES_MAX })}</p>
          {categories.length === 0 && (
            <p role="alert" className={styles.error}>
              {t.categoriesUnavailable}
            </p>
          )}
          <div className={styles.checks}>
            {categories.map((c) => (
              <label key={c.code}>
                <input
                  type="checkbox"
                  name="categories"
                  value={c.code}
                  defaultChecked={initial?.category === c.code}
                  {...err('categories')}
                />{' '}
                {pickText(c.name, locale)}
              </label>
            ))}
          </div>
        </div>
      </fieldset>
      <label className={styles.field}>
        <span>{dict.search.prefecture} *</span>
        <select name="prefecture" required defaultValue={initial?.prefecture ?? ''} {...err('prefecture')}>
          <option value="" disabled>
            —
          </option>
          {PREFECTURES.map((p) => (
            <option key={p.code} value={p.code}>
              {prefectureName(p.code, locale)}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.field}>
        <span>{t.city}</span>
        <input name="city" defaultValue={initial?.city} maxLength={LISTING_TEXT_MAX.city} {...err('city')} />
      </label>
      <fieldset className={styles.fieldset}>
        <legend>{dict.detail.languages} *</legend>
        <div className={styles.checks}>
          {locales.map((l) => (
            <label key={l}>
              <input
                type="checkbox"
                name="supportedLanguages"
                value={l}
                defaultChecked={initial?.supportedLanguages.includes(l)}
                {...err('supportedLanguages')} /> {localeNames[l]}
            </label>
          ))}
        </div>
      </fieldset>
      <LocalizedFields field="name" legend={t.serviceName} required invalid={invalid} initial={initial?.name} />
      <LocalizedFields field="description" legend={t.description} required multiline invalid={invalid} />
      <LocalizedFields field="address" legend={dict.detail.address} invalid={invalid} initial={initial?.address} />
      <label className={styles.field}>
        <span>{dict.detail.phone}</span>
        <input name="phone" type="tel" defaultValue={initial?.phone} maxLength={LISTING_TEXT_MAX.phone} {...err('phone')} />
      </label>
      <label className={styles.field}>
        <span>{dict.detail.website}</span>
        <input
          name="websiteUrl"
          type="url"
          defaultValue={initial?.websiteUrl}
          maxLength={LISTING_TEXT_MAX.websiteUrl}
          placeholder="https://"
          {...err('websiteUrl')}
        />
      </label>
      <label className={styles.field}>
        <span>{t.contactName} *</span>
        <input name="contactName" required maxLength={100} autoComplete="name" {...err('contactName')} />
      </label>
      <label className={styles.field}>
        <span>{t.contactEmail} *</span>
        <input
          name="contactEmail"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          {...err('contactEmail')}
        />
      </label>
      {(status === 'invalid' || status === 'error') && (
        <div id={ERROR_ID} role="alert" className={styles.error}>
          {status === 'invalid' && invalidLabels.length > 0 ? (
            <>
              {t.invalidFields}
              <ul>
                {invalidLabels.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            </>
          ) : status === 'invalid' ? (
            t.invalid
          ) : (
            t.error
          )}
        </div>
      )}
      <button type="submit" className={styles.submit} disabled={status === 'sending'}>
        {status === 'sending' ? t.sending : t.submit}
      </button>
    </form>
  );
}
