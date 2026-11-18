'use client';

import { startTransition, useActionState, type FormEvent } from 'react';
import type { FormState } from '../../app/admin/actions';
import formStyles from '../Form.module.css';

/** 申請の承認（slug を決めて ServiceListing を作成） */
export function ApproveForm({
  action,
  suggestedSlug,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  suggestedSlug: string;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  // form の action 属性に渡すと React 19 が送信後に入力をリセットするため、エラー時に入力を残せるよう onSubmit で呼ぶ
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(() => formAction(form));
  };
  return (
    <form onSubmit={onSubmit} className={formStyles.checks}>
      <label>
        slug <input name="slug" defaultValue={suggestedSlug} required />
      </label>
      <label>
        <input type="checkbox" name="isPublished" /> 承認と同時に公開
      </label>
      <button type="submit" className={formStyles.submit} disabled={pending}>
        承認
      </button>
      {state.error && (
        <span role="alert" className={formStyles.error}>
          {state.error}
        </span>
      )}
    </form>
  );
}
