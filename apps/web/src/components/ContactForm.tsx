'use client';

import { useState, type FormEvent } from 'react';
import { INQUIRY_MESSAGE_MAX, InquiryInputSchema, type SupportedLocale } from '@fss/shared/domain';
import type { Dictionary } from '../i18n/dictionaries';
import { API_URL } from '../lib/api';
import { invalidFieldNames, invalidProps } from '../lib/formErrors';
import styles from './Form.module.css';

type Status = 'idle' | 'sending' | 'sent' | 'invalid' | 'rateLimited' | 'error';
type FormState = { status: Status; invalid: string[] };

const ERROR_ID = 'contact-form-error';

/** お問い合わせフォーム。ブラウザから API へ直接送信する（IP 毎の送信制限を利用者単位で効かせるため） */
export function ContactForm({ locale, t }: { locale: SupportedLocale; t: Dictionary['contact'] }) {
  const [{ status, invalid }, setState] = useState<FormState>({ status: 'idle', invalid: [] });
  const setStatus = (next: Status) => setState({ status: next, invalid: [] });
  const labels: Record<string, string> = { name: t.name, email: t.email, message: t.message };
  const invalidLabels = invalid.map((name) => labels[name]).filter((label): label is string => !!label);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const parsed = InquiryInputSchema.safeParse({ ...values, locale });
    if (!parsed.success) {
      setState({ status: 'invalid', invalid: invalidFieldNames(parsed.error.issues) });
      return;
    }
    setStatus('sending');
    try {
      const res = await fetch(`${API_URL}/api/v1/inquiries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      if (res.status === 201) {
        form.reset();
        setStatus('sent');
      } else {
        setStatus(res.status === 429 ? 'rateLimited' : res.status === 400 ? 'invalid' : 'error');
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

  const message =
    status === 'invalid' && invalidLabels.length > 0 ? (
      <>
        {t.invalidFields}
        <ul>
          {invalidLabels.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
      </>
    ) : status === 'invalid'
      ? t.invalid : status === 'rateLimited' ? t.rateLimited : status === 'error' ? t.error : null;

  return (
    <form onSubmit={onSubmit} className={styles.form} noValidate>
      <label className={styles.field}>
        <span>{t.name}</span>
        <input name="name" required maxLength={100} autoComplete="name" {...invalidProps(invalid, 'name', ERROR_ID)} />
      </label>
      <label className={styles.field}>
        <span>{t.email}</span>
        <input
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          {...invalidProps(invalid, 'email', ERROR_ID)}
        />
      </label>
      <label className={styles.field}>
        <span>{t.message}</span>
        <textarea
          name="message"
          required
          maxLength={INQUIRY_MESSAGE_MAX}
          rows={8}
          {...invalidProps(invalid, 'message', ERROR_ID)}
        />
      </label>
      {/* ハニーポット: 人には見えない。ボットが入力すると保存されない */}
      <div className={styles.honeypot} aria-hidden="true">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {message && (
        <div id={ERROR_ID} role="alert" className={styles.error}>
          {message}
        </div>
      )}
      <button type="submit" className={styles.submit} disabled={status === 'sending'}>
        {status === 'sending' ? t.sending : t.submit}
      </button>
    </form>
  );
}
