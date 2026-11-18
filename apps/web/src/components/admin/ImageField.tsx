'use client';

import { useState, type ChangeEvent } from 'react';
import { IMAGE_CONTENT_TYPES, IMAGE_MAX_BYTES } from '@fss/shared/domain';
import { createUploadTicket } from '../../app/admin/actions';
import formStyles from '../Form.module.css';
import styles from '../../app/admin/admin.module.css';

/** 掲載画像。選択するとアップロード先を発行してブラウザから直接 PUT し、キーを hidden の imageKey に入れる */
export function ImageField({ initialKey, initialUrl }: { initialKey?: string | null; initialUrl?: string | null }) {
  const [key, setKey] = useState(initialKey ?? '');
  const [url, setUrl] = useState(initialUrl ?? '');
  const [status, setStatus] = useState<'idle' | 'uploading' | 'error'>('idle');
  const [error, setError] = useState('');

  async function onChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const fail = (message: string) => {
      setStatus('error');
      setError(message);
    };
    if (!(IMAGE_CONTENT_TYPES as readonly string[]).includes(file.type) || file.size > IMAGE_MAX_BYTES) {
      return fail('JPEG / PNG / WebP の 5MB 以下の画像を選択してください。');
    }
    setStatus('uploading');
    const result = await createUploadTicket(file.type, file.size);
    if ('error' in result) return fail(result.error);
    const { ticket } = result;
    try {
      const res = await fetch(ticket.uploadUrl, { method: 'PUT', headers: ticket.headers, body: file });
      if (!res.ok) return fail(`アップロードに失敗しました（${res.status}）。`);
    } catch {
      return fail('アップロードに失敗しました。');
    }
    setKey(ticket.key);
    setUrl(ticket.publicUrl);
    setStatus('idle');
  }

  return (
    <fieldset className={formStyles.fieldset}>
      <legend>画像（JPEG / PNG / WebP、5MB まで）</legend>
      <input type="hidden" name="imageKey" value={key} />
      {url && <img src={url} alt="掲載画像のプレビュー" className={styles.preview} />}
      <div className={formStyles.checks}>
        <input type="file" accept={IMAGE_CONTENT_TYPES.join(',')} onChange={onChange} disabled={status === 'uploading'} />
        {key && (
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => {
              setKey('');
              setUrl('');
            }}
          >
            画像を外す
          </button>
        )}
      </div>
      {status === 'uploading' && <p className={formStyles.hint}>アップロード中…</p>}
      {status === 'error' && (
        <p role="alert" className={formStyles.error}>
          {error}
        </p>
      )}
    </fieldset>
  );
}
