'use client';

import { startTransition, useActionState, type FormEvent } from 'react';
import { CRAWL_BLOCK_NOTE_MAX } from '@fss/shared/domain';
import type { FormState } from '../../app/admin/actions';
import formStyles from '../Form.module.css';

export const BLOCK_REASON_LABELS = { optout: '停止・削除の依頼', terms: '利用規約で禁止', robots: 'robots.txt で拒否' } as const;

/** ブロックリストへの追加（ドメインまたは法人番号、F-116） */
export function BlocklistForm({ action }: { action: (state: FormState, form: FormData) => Promise<FormState> }) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  // React 19 の form action は送信後に入力をリセットするため、エラー時に入力を残せるよう onSubmit で呼ぶ
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(() => formAction(form));
  };
  return (
    <form onSubmit={onSubmit} className={formStyles.form} noValidate>
      <label className={formStyles.field}>
        <span>ドメイン（サブドメインも対象）</span>
        <input name="domain" placeholder="example.com" maxLength={253} autoComplete="off" />
      </label>
      <label className={formStyles.field}>
        <span>法人番号（13 桁）</span>
        <input name="corporateNumber" inputMode="numeric" maxLength={13} autoComplete="off" />
      </label>
      <label className={formStyles.field}>
        <span>理由</span>
        <select name="reason" defaultValue="optout" required>
          {Object.entries(BLOCK_REASON_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className={formStyles.field}>
        <span>メモ（任意。依頼の受付日など。個人情報は書かない）</span>
        <input name="note" maxLength={CRAWL_BLOCK_NOTE_MAX} autoComplete="off" />
      </label>
      {state.error && (
        <p role="alert" className={formStyles.error}>
          {state.error}
        </p>
      )}
      <button type="submit" className={formStyles.submit} disabled={pending}>
        追加
      </button>
    </form>
  );
}
