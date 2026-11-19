'use client';

import { startTransition, useActionState, type FormEvent } from 'react';
import { CANDIDATE_REVIEW_NOTE_MAX } from '@fss/shared/collector';
import type { FormState } from '../../app/admin/actions';
import formStyles from '../Form.module.css';

/** 候補の却下・保留（理由・メモは任意） */
export function CandidateReviewForm({
  action,
  label,
  submitLabel,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  label: string;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  // React 19 の form action は送信後に入力をリセットするため、エラー時に入力を残せるよう onSubmit で呼ぶ
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(() => formAction(form));
  };
  return (
    <form onSubmit={onSubmit} className={formStyles.form}>
      <label className={formStyles.field}>
        <span>{label}</span>
        <input name="note" maxLength={CANDIDATE_REVIEW_NOTE_MAX} autoComplete="off" />
      </label>
      {state.error && (
        <p role="alert" className={formStyles.error}>
          {state.error}
        </p>
      )}
      <button type="submit" className={formStyles.submit} disabled={pending}>
        {submitLabel}
      </button>
    </form>
  );
}
