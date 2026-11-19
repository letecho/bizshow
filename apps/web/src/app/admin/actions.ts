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
import { adminFetch } from '../../lib/adminApi';
import { listingFormToInput } from '../../lib/listingForm';

export interface FormState {
  error: string | null;
}

/** API エラーを画面表示用の文言にする。未認証はログインへ */
async function errorMessage(res: Response): Promise<string> {
  if (res.status === 401 || res.status === 403) redirect('/admin/login');
  if (res.status === 409) return 'この slug は既に使われています（または申請は処理済みです）。';
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
