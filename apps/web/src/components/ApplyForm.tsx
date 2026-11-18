'use client';

import { useState, type FormEvent } from 'react';
import { ListingRequestInputSchema, PREFECTURES, SERVICE_CATEGORIES, type SupportedLocale } from '@fss/shared/domain';
import type { Dictionary } from '../i18n/dictionaries';
import { localeNames, locales } from '../i18n/config';
import { prefectureName } from '../i18n/labels';
import { API_URL } from '../lib/api';
import { listingFormToInput } from '../lib/listingForm';
import styles from './Form.module.css';

type Status = 'idle' | 'sending' | 'sent' | 'invalid' | 'error';

/** 各言語の入力欄（en 必須） */
function LocalizedFields({
  field,
  legend,
  required,
  multiline,
}: {
  field: string;
  legend: string;
  required?: boolean;
  multiline?: boolean;
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
            <textarea name={`${field}_${l}`} rows={4} required={required && l === 'en'} />
          ) : (
            <input name={`${field}_${l}`} required={required && l === 'en'} />
          )}
        </label>
      ))}
    </fieldset>
  );
}

/** 事業者の掲載申請フォーム。shared スキーマで事前検証し API へ送信する */
export function ApplyForm({ locale, dict }: { locale: SupportedLocale; dict: Dictionary }) {
  const t = dict.apply;
  const [status, setStatus] = useState<Status>('idle');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const parsed = ListingRequestInputSchema.safeParse(listingFormToInput(new FormData(form)));
    if (!parsed.success) {
      setStatus('invalid');
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
      <label className={styles.field}>
        <span>{dict.search.category} *</span>
        <select name="category" required defaultValue="">
          <option value="" disabled>
            —
          </option>
          {SERVICE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {dict.categories[c]}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.field}>
        <span>{dict.search.prefecture} *</span>
        <select name="prefecture" required defaultValue="">
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
        <input name="city" maxLength={100} />
      </label>
      <fieldset className={styles.fieldset}>
        <legend>{dict.detail.languages} *</legend>
        <div className={styles.checks}>
          {locales.map((l) => (
            <label key={l}>
              <input type="checkbox" name="supportedLanguages" value={l} /> {localeNames[l]}
            </label>
          ))}
        </div>
      </fieldset>
      <LocalizedFields field="name" legend={t.serviceName} required />
      <LocalizedFields field="description" legend={t.description} required multiline />
      <LocalizedFields field="address" legend={dict.detail.address} />
      <label className={styles.field}>
        <span>{dict.detail.phone}</span>
        <input name="phone" type="tel" maxLength={20} />
      </label>
      <label className={styles.field}>
        <span>{dict.detail.website}</span>
        <input name="websiteUrl" type="url" maxLength={500} placeholder="https://" />
      </label>
      <label className={styles.field}>
        <span>{t.contactName} *</span>
        <input name="contactName" required maxLength={100} autoComplete="name" />
      </label>
      <label className={styles.field}>
        <span>{t.contactEmail} *</span>
        <input name="contactEmail" type="email" required maxLength={254} autoComplete="email" />
      </label>
      {(status === 'invalid' || status === 'error') && (
        <p role="alert" className={styles.error}>
          {status === 'invalid' ? t.invalid : t.error}
        </p>
      )}
      <button type="submit" className={styles.submit} disabled={status === 'sending'}>
        {status === 'sending' ? t.sending : t.submit}
      </button>
    </form>
  );
}
