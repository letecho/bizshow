'use client';

import { useState, useTransition, type MouseEvent } from 'react';
import { SUPPORTED_LOCALES } from '@fss/shared/domain';
import type { DescriptionDraftState } from '../../app/admin/actions';
import formStyles from '../Form.module.css';

/**
 * 承認フォームの「説明文の下書きを作成」（F-117）。
 * 下書きは同じフォームの説明欄（description_*）のうち空の欄にだけ入れる（入力済みの欄は変えない）。保存は承認時。
 */
export function DescriptionDraftButton({ action }: { action: () => Promise<DescriptionDraftState> }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const onClick = (event: MouseEvent<HTMLButtonElement>) => {
    const form = event.currentTarget.form;
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (!result.description) {
        setMessage({ text: result.error ?? '下書きを作成できませんでした。', error: true });
        return;
      }
      const filled: string[] = [];
      for (const locale of SUPPORTED_LOCALES) {
        const field = form?.elements.namedItem(`description_${locale}`);
        if (field instanceof HTMLTextAreaElement && field.value.trim() === '') {
          field.value = result.description[locale];
          filled.push(locale);
        }
      }
      setMessage({
        text:
          filled.length > 0
            ? `説明（${filled.join(', ')}）に下書きを入力しました。内容が事実と合っているか確認・修正してから承認してください。`
            : '説明はすべて入力済みのため、下書きは入力しませんでした。',
        error: false,
      });
    });
  };

  return (
    <div className={formStyles.checks}>
      <button type="button" onClick={onClick} disabled={pending} aria-describedby="description-draft-note">
        {pending ? '下書きを作成中…' : '説明文の下書きを作成'}
      </button>
      <span id="description-draft-note">
        名称・カテゴリ・地域・対応言語だけから LLM で 4 言語の短い説明文を作り、空の説明欄に入れます（収集元の文章は使いません）。
      </span>
      <span role="status" className={message?.error ? formStyles.error : undefined}>
        {message?.text}
      </span>
    </div>
  );
}
