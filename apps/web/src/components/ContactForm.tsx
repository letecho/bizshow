'use client';

import { useState, type FormEvent } from 'react';
import { INQUIRY_MESSAGE_MAX, InquiryInputSchema, type SupportedLocale } from '@fss/shared/domain';
import type { Dictionary } from '../i18n/dictionaries';
import { API_URL } from '../lib/api';
import styles from './ContactForm.module.css';

type Status = 'idle' | 'sending' | 'sent' | 'invalid' | 'rateLimited' | 'error';

/** お問い合わせフォーム。ブラウザから API へ直接送信する（IP 毎の送信制限を利用者単位で効かせるため） */
export function ContactForm({ locale, t }: { locale: SupportedLocale; t: Dictionary['contact'] }) {
  const [status, setStatus] = useState<Status>('idle');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const parsed = InquiryInputSchema.safeParse({ ...values, locale });
    if (!parsed.success) {
      setStatus('invalid');
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

  const message = status === 'invalid' ? t.invalid : status === 'rateLimited' ? t.rateLimited : status === 'error' ? t.error : null;

  return (
    <form onSubmit={onSubmit} className={styles.form} noValidate>
      <label className={styles.field}>
        <span>{t.name}</span>
        <input name="name" required maxLength={100} autoComplete="name" />
      </label>
      <label className={styles.field}>
        <span>{t.email}</span>
        <input name="email" type="email" required maxLength={254} autoComplete="email" />
      </label>
      <label className={styles.field}>
        <span>{t.message}</span>
        <textarea name="message" required maxLength={INQUIRY_MESSAGE_MAX} rows={8} />
      </label>
      {/* ハニーポット: 人には見えない。ボットが入力すると保存されない */}
      <div className={styles.honeypot} aria-hidden="true">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {message && (
        <p role="alert" className={styles.error}>
          {message}
        </p>
      )}
      <button type="submit" className={styles.submit} disabled={status === 'sending'}>
        {status === 'sending' ? t.sending : t.submit}
      </button>
    </form>
  );
}
