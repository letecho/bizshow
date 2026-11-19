'use client';

import { startTransition, useActionState, type FormEvent } from 'react';
import type { AdminOutreachStatus } from '@fss/shared/outreach';
import type { OutreachFormState } from '../../app/admin/actions';
import formStyles from '../Form.module.css';

type Action = (state: OutreachFormState, form: FormData) => Promise<OutreachFormState>;

const STATUS_LABELS = { pending: '送信中', sent: '送信済み', failed: '失敗' } as const;

/** React 19 の form action は送信後に入力をリセットするため、エラー時に入力を残せるよう onSubmit で呼ぶ */
function useForm(action: Action) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(() => formAction(form));
  };
  return { state, onSubmit, pending };
}

/** 候補詳細の「掲載案内」（F-118）: 送信履歴・送信フォーム・受信拒否の登録 */
export function OutreachPanel({
  status,
  sendAction,
  optOutAction,
}: {
  status: AdminOutreachStatus;
  sendAction: Action;
  optOutAction: Action;
}) {
  const send = useForm(sendAction);
  const optOut = useForm(optOutAction);
  const remaining = Math.max(0, status.dailyLimit - status.sentToday);

  return (
    <>
      {status.history.length > 0 && (
        <ul>
          {status.history.map((h) => (
            <li key={h.id}>
              {h.createdAt.slice(0, 16).replace('T', ' ')} UTC {h.email}（{STATUS_LABELS[h.status]}）
            </li>
          ))}
        </ul>
      )}
      {!status.enabled ? (
        <p>掲載案内の送信は無効です（OUTREACH_ENABLED=true と送信者情報の設定で有効になります）。</p>
      ) : (
        <form onSubmit={send.onSubmit} className={formStyles.form}>
          <p>
            事業者が自ら Web 上で公表しているメールアドレスにだけ送れます（個人のアドレス・お問い合わせフォームには送りません）。今日の残り
            {remaining} 件（上限 {status.dailyLimit} 件）。
          </p>
          <label className={formStyles.field}>
            <span>宛先メールアドレス</span>
            <input name="to" type="email" required maxLength={254} autoComplete="off" />
          </label>
          <label className={formStyles.field}>
            <span>アドレスが公表されているページの URL</span>
            <input name="publishedUrl" type="url" required maxLength={2000} placeholder="https://" autoComplete="off" />
          </label>
          <label>
            <input type="checkbox" name="confirmedNoOptOutNotice" required /> 公表ページに「営業メールお断り」などの受信拒否の表示が無いことを確認した
          </label>
          {send.state.error && (
            <p role="alert" className={formStyles.error}>
              {send.state.error}
            </p>
          )}
          {send.state.sent && <p role="status">掲載案内を送信しました。</p>}
          <button type="submit" className={formStyles.submit} disabled={send.pending || remaining === 0}>
            掲載案内を送る
          </button>
        </form>
      )}
      <form onSubmit={optOut.onSubmit} className={formStyles.form}>
        <label className={formStyles.field}>
          <span>受信拒否の登録（返信・電話などで依頼を受けたアドレス）</span>
          <input name="email" type="email" required maxLength={254} autoComplete="off" />
        </label>
        {optOut.state.error && (
          <p role="alert" className={formStyles.error}>
            {optOut.state.error}
          </p>
        )}
        {optOut.state.sent && <p role="status">受信拒否を登録しました。</p>}
        <button type="submit" className={formStyles.submit} disabled={optOut.pending}>
          受信拒否を登録
        </button>
      </form>
    </>
  );
}
