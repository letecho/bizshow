'use client';

import { useState, type FormEvent } from 'react';
import type { Dictionary } from '../i18n/dictionaries';
import { API_URL } from '../lib/api';
import styles from './Form.module.css';

type Status = 'idle' | 'sending' | 'done' | 'invalid' | 'error';

/** 掲載案内の受信拒否（F-118）。メールのリンクのトークンを API に送る */
export function OptOutForm({ token, t }: { token: string; t: Dictionary['optOut'] }) {
  const [status, setStatus] = useState<Status>(token ? 'idle' : 'invalid');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('sending');
    try {
      const res = await fetch(`${API_URL}/api/v1/outreach/opt-out`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      setStatus(res.ok ? 'done' : res.status === 404 || res.status === 400 ? 'invalid' : 'error');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'done') {
    return (
      <p role="status" className={styles.success}>
        {t.done}
      </p>
    );
  }
  if (status === 'invalid') {
    return (
      <p role="alert" className={styles.error}>
        {t.invalid}
      </p>
    );
  }
  return (
    <form onSubmit={onSubmit} className={styles.form}>
      {status === 'error' && (
        <p role="alert" className={styles.error}>
          {t.error}
        </p>
      )}
      <button type="submit" className={styles.submit} disabled={status === 'sending'}>
        {status === 'sending' ? t.sending : t.submit}
      </button>
    </form>
  );
}
