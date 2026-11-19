'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  AdminServiceInputSchema,
  ApproveListingRequestSchema,
  CrawlBlocklistInputSchema,
  UploadRequestSchema,
  type UploadTicket,
} from '@fss/shared/domain';
import { ApproveCandidateSchema, HoldCandidateSchema, RejectCandidateSchema } from '@fss/shared/collector';
import { DescriptionDraftSchema, type DescriptionDraft } from '@fss/shared/llm';
import { OutreachOptOutInputSchema, SendOutreachSchema } from '@fss/shared/outreach';
import { adminFetch } from '../../lib/adminApi';
import { listingFormToInput } from '../../lib/listingForm';

export interface FormState {
  error: string | null;
}

/** API エラーを画面表示用の文言にする。未認証はログインへ */
async function errorMessage(res: Response): Promise<string> {
  if (res.status === 401 || res.status === 403) redirect('/admin/login');
  if (res.status === 409) return 'この slug は既に使われています（または申請・候補は処理済みです）。';
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? `保存に失敗しました（${res.status}）。`;
}

function serviceInput(form: FormData) {
  return AdminServiceInputSchema.safeParse({
    ...listingFormToInput(form),
    slug: String(form.get('slug') ?? ''),
    isPublished: form.get('isPublished') === 'on',
    imageKey: String(form.get('imageKey') ?? ''),
  });
}

const INVALID = '入力内容を確認してください（slug は英小文字・数字・ハイフン、英語のサービス名と説明は必須）。';

export async function createService(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = serviceInput(form);
  if (!parsed.success) return { error: INVALID };
  const res = await adminFetch('/services', { method: 'POST', body: JSON.stringify(parsed.data) });
  if (!res.ok) return { error: await errorMessage(res) };
  revalidatePath('/admin');
  redirect('/admin');
}

export async function updateService(id: string, _prev: FormState, form: FormData): Promise<FormState> {
  const parsed = serviceInput(form);
  if (!parsed.success) return { error: INVALID };
  const res = await adminFetch(`/services/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(parsed.data) });
  if (!res.ok) return { error: await errorMessage(res) };
  revalidatePath('/admin');
  redirect('/admin');
}

export async function deleteService(id: string): Promise<void> {
  const res = await adminFetch(`/services/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error(await errorMessage(res));
  revalidatePath('/admin');
  redirect('/admin');
}

export async function setPublished(id: string, isPublished: boolean): Promise<void> {
  const res = await adminFetch(`/services/${encodeURIComponent(id)}/publish`, {
    method: 'PATCH',
    body: JSON.stringify({ isPublished }),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  revalidatePath('/admin');
}

export async function approveRequest(id: string, _prev: FormState, form: FormData): Promise<FormState> {
  const parsed = ApproveListingRequestSchema.safeParse({
    slug: String(form.get('slug') ?? ''),
    isPublished: form.get('isPublished') === 'on',
  });
  if (!parsed.success) return { error: 'slug は英小文字・数字・ハイフンで入力してください。' };
  const res = await adminFetch(`/listing-requests/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
    body: JSON.stringify(parsed.data),
  });
  if (!res.ok) return { error: await errorMessage(res) };
  revalidatePath('/admin/listing-requests');
  revalidatePath('/admin');
  return { error: null };
}

export async function rejectRequest(id: string): Promise<void> {
  const res = await adminFetch(`/listing-requests/${encodeURIComponent(id)}/reject`, { method: 'POST' });
  if (!res.ok) throw new Error(await errorMessage(res));
  revalidatePath('/admin/listing-requests');
}

/** 画像アップロード先（presigned PUT URL）を発行する。ファイル本体はブラウザから直接 PUT する */
export async function createUploadTicket(
  contentType: string,
  size: number,
): Promise<{ ticket: UploadTicket } | { error: string }> {
  const parsed = UploadRequestSchema.safeParse({ contentType, size });
  if (!parsed.success) return { error: 'JPEG / PNG / WebP の 5MB 以下の画像を選択してください。' };
  const res = await adminFetch('/uploads', { method: 'POST', body: JSON.stringify(parsed.data) });
  if (!res.ok) return { error: await errorMessage(res) };
  return { ticket: ((await res.json()) as { data: UploadTicket }).data };
}

/** ブロックリストに追加（F-116） */
export async function createBlockEntry(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = CrawlBlocklistInputSchema.safeParse({
    domain: String(form.get('domain') ?? ''),
    corporateNumber: String(form.get('corporateNumber') ?? ''),
    reason: String(form.get('reason') ?? ''),
    note: String(form.get('note') ?? ''),
  });
  if (!parsed.success) {
    return { error: 'ドメイン（例: example.com）または法人番号（13 桁）のどちらかを正しく入力し、理由を選んでください（メモは 500 字まで）。' };
  }
  const res = await adminFetch('/blocklist', { method: 'POST', body: JSON.stringify(parsed.data) });
  if (!res.ok) return { error: await errorMessage(res) };
  revalidatePath('/admin/blocklist');
  redirect('/admin/blocklist');
}

export async function deleteBlockEntry(id: string): Promise<void> {
  const res = await adminFetch(`/blocklist/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error(await errorMessage(res));
  revalidatePath('/admin/blocklist');
}

/** 掲載候補の承認（F-113）。管理者が確認・編集した値で掲載を作成（update 候補は既存を更新）する */
export async function approveCandidate(id: string, _prev: FormState, form: FormData): Promise<FormState> {
  const entityType = String(form.get('entityType') ?? '');
  const consentEvidence = form.get('consentEvidence');
  const parsed = ApproveCandidateSchema.safeParse({
    ...listingFormToInput(form),
    slug: String(form.get('slug') ?? ''),
    isPublished: form.get('isPublished') === 'on',
    imageKey: String(form.get('imageKey') ?? ''),
    ...(entityType && { entityOverride: { entityType, evidence: String(form.get('entityEvidence') ?? '') } }),
    ...(consentEvidence !== null && { consent: { evidence: String(consentEvidence) } }),
  });
  if (!parsed.success) {
    const field = parsed.error.issues.find((i) => i.path[0] === 'entityOverride' || i.path[0] === 'consent')?.path[0];
    return {
      error:
        field === 'entityOverride'
          ? '事業者の種類を変更する場合は、確認した根拠（法人番号など）を入力してください。'
          : field === 'consent'
            ? '掲載への本人の同意の記録（掲載申請・掲載案内への承諾など）を入力してください。'
            : INVALID,
    };
  }
  const res = await adminFetch(`/candidates/${encodeURIComponent(id)}/approve`, { method: 'POST', body: JSON.stringify(parsed.data) });
  if (!res.ok) return { error: await errorMessage(res) };
  revalidatePath('/admin/candidates');
  revalidatePath('/admin');
  redirect('/admin/candidates');
}

/** 却下・保留（理由・メモは任意、500 字まで） */
export async function reviewCandidate(id: string, decision: 'reject' | 'hold', _prev: FormState, form: FormData): Promise<FormState> {
  const text = String(form.get('note') ?? '');
  const parsed =
    decision === 'reject' ? RejectCandidateSchema.safeParse({ reason: text }) : HoldCandidateSchema.safeParse({ note: text });
  if (!parsed.success) return { error: '理由・メモは 500 字以内で入力してください。' };
  const res = await adminFetch(`/candidates/${encodeURIComponent(id)}/${decision}`, { method: 'POST', body: JSON.stringify(parsed.data) });
  if (!res.ok) return { error: await errorMessage(res) };
  revalidatePath('/admin/candidates');
  redirect('/admin/candidates');
}

export interface DescriptionDraftState {
  description?: DescriptionDraft;
  error?: string;
}

const DRAFT_ERRORS: Record<string, string> = {
  LLM_DISABLED: '説明文の下書きは利用できません（LLM が無効です）。',
  LLM_BUDGET_EXCEEDED: '今月の LLM の予算上限に達したため、下書きを作成できません。',
  LLM_UNAVAILABLE: 'LLM に接続できませんでした。時間をおいて再度お試しください。',
  LLM_INVALID_OUTPUT: '下書きを作成できませんでした（出力が検証に通りませんでした）。もう一度お試しください。',
};

/** 説明文の下書き（F-117）。候補の事実（名称・カテゴリ・地域・対応言語）から 4 言語の短い説明文を作る。保存はしない */
export async function draftCandidateDescription(id: string): Promise<DescriptionDraftState> {
  const res = await adminFetch(`/candidates/${encodeURIComponent(id)}/description-draft`, { method: 'POST' });
  if (res.status === 401 || res.status === 403) redirect('/admin/login');
  const body = (await res.json().catch(() => null)) as { data?: { description?: unknown }; error?: { code?: string } } | null;
  if (!res.ok) {
    if (res.status === 409 && body?.error?.code === 'CONFLICT') return { error: 'この候補は処理済みです。' };
    return { error: DRAFT_ERRORS[body?.error?.code ?? ''] ?? `下書きを作成できませんでした（${res.status}）。` };
  }
  const parsed = DescriptionDraftSchema.safeParse(body?.data?.description);
  return parsed.success ? { description: parsed.data } : { error: DRAFT_ERRORS.LLM_INVALID_OUTPUT };
}

const OUTREACH_ERRORS: Record<string, string> = {
  OUTREACH_DISABLED: '掲載案内の送信は無効です（OUTREACH_ENABLED）。',
  OUTREACH_BLOCKED: 'この事業者はブロックリストに登録されているため送信できません。',
  OUTREACH_OPTED_OUT: 'このアドレスは受信拒否されているため送信できません。',
  OUTREACH_ALREADY_SENT: 'このアドレスには既に案内を送信しています（同じ宛先へは再送しません）。',
  OUTREACH_DAILY_LIMIT: '今日の送信上限に達しました。明日以降に送信してください。',
  MAIL_FAILED: 'メールを送信できませんでした。時間をおいて再度お試しください。',
  CONFLICT: 'この候補は処理済みです。',
};

export interface OutreachFormState {
  error: string | null;
  sent?: boolean;
}

/** 掲載案内の送信（F-118）。管理者が宛先と公表ページを確認して 1 件ずつ送る */
export async function sendOutreach(candidateId: string, _prev: OutreachFormState, form: FormData): Promise<OutreachFormState> {
  const parsed = SendOutreachSchema.safeParse({
    to: String(form.get('to') ?? ''),
    publishedUrl: String(form.get('publishedUrl') ?? ''),
    confirmedNoOptOutNotice: form.get('confirmedNoOptOutNotice') === 'on',
  });
  if (!parsed.success) {
    return { error: 'メールアドレス・公表ページの URL（https://）を入力し、受信拒否の表示が無いことを確認してください。' };
  }
  const res = await adminFetch(`/candidates/${encodeURIComponent(candidateId)}/outreach`, {
    method: 'POST',
    body: JSON.stringify(parsed.data),
  });
  if (res.status === 401 || res.status === 403) redirect('/admin/login');
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    return { error: OUTREACH_ERRORS[body?.error?.code ?? ''] ?? body?.error?.message ?? `送信に失敗しました（${res.status}）。` };
  }
  revalidatePath(`/admin/candidates/${candidateId}`);
  return { error: null, sent: true };
}

/** 受信拒否の登録（返信・電話などで受けた場合、F-118） */
export async function registerOutreachOptOut(_prev: OutreachFormState, form: FormData): Promise<OutreachFormState> {
  const parsed = OutreachOptOutInputSchema.safeParse({ email: String(form.get('email') ?? '') });
  if (!parsed.success) return { error: 'メールアドレスを正しく入力してください。' };
  const res = await adminFetch('/outreach/opt-outs', { method: 'POST', body: JSON.stringify(parsed.data) });
  if (!res.ok) return { error: await errorMessage(res) };
  return { error: null, sent: true };
}
