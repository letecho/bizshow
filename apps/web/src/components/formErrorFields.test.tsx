import { describe, it, expect, vi } from 'vitest';
import { isValidElement, type ReactNode } from 'react';
import { INITIAL_CATEGORIES, InquiryInputSchema, ListingRequestInputSchema, SUPPORTED_LOCALES } from '@fss/shared/domain';
import { getDictionary } from '../i18n/dictionaries';
import { invalidFieldNames } from '../lib/formErrors';

// B-009: お問い合わせ・掲載申請の入力エラーで、誤りのある項目が項目名で示され aria-invalid が付く（WCAG 2.2 SC 3.3.1）

// フォームを関数として呼んで要素ツリーを得る。useState は preset があればそれを返す
let preset: unknown;
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useState: <T,>(init: T) => [preset ?? init, () => {}] };
});

const { ContactForm } = await import('./ContactForm');
const { ApplyForm } = await import('./ApplyForm');

type Props = { name?: string; id?: string; role?: string; children?: ReactNode; [k: string]: unknown };

/** 要素ツリー（関数コンポーネントは展開）を平らにする */
function flatten(node: ReactNode, out: { type: unknown; props: Props }[] = []) {
  if (Array.isArray(node)) {
    node.forEach((n) => flatten(n, out));
    return out;
  }
  if (!isValidElement<Props>(node)) return out;
  if (typeof node.type === 'function') return flatten((node.type as (p: unknown) => ReactNode)(node.props), out);
  out.push({ type: node.type, props: node.props });
  return flatten(node.props.children, out);
}

function text(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  if (isValidElement<Props>(node)) return text(node.props.children);
  return '';
}

/** name → aria-invalid の付いた入力欄 */
const invalidControls = (els: ReturnType<typeof flatten>) =>
  els.filter((e) => e.props['aria-invalid'] === true).map((e) => e.props.name);

describe('invalidFieldNames', () => {
  it('お問い合わせ: メール形式の誤りは email だけ', () => {
    const r = InquiryInputSchema.safeParse({ name: 'A', email: 'not-an-email', message: 'hi', locale: 'ja' });
    expect(r.success).toBe(false);
    expect(invalidFieldNames(r.error!.issues)).toEqual(['email']);
  });

  it('掲載申請: 多言語の入力欄は {field}_{locale} になる', () => {
    const r = ListingRequestInputSchema.safeParse({
      categories: ['legal'],
      prefecture: 'tokyo',
      supportedLanguages: [],
      name: { ja: '名前' },
      description: { en: 'desc' },
      contactName: 'A',
      contactEmail: 'a@example.com',
    });
    expect(r.success).toBe(false);
    expect(invalidFieldNames(r.error!.issues).sort()).toEqual(['name_en', 'supportedLanguages']);
  });
});

describe('ContactForm のエラー表示', () => {
  it('誤りのある項目名をエラー文に出し、その入力欄だけ aria-invalid と aria-describedby を付ける', () => {
    const t = getDictionary('ja').contact;
    preset = { status: 'invalid', invalid: ['email'] };
    const els = flatten(ContactForm({ locale: 'ja', t }));
    preset = undefined;

    const alert = els.find((e) => e.props.role === 'alert');
    expect(alert).toBeDefined();
    const message = text(alert!.props.children);
    expect(message).toContain(t.invalidFields);
    expect(message).toContain(t.email);
    expect(message).not.toContain(t.name);
    expect(invalidControls(els)).toEqual(['email']);
    const email = els.find((e) => e.props.name === 'email')!;
    expect(email.props['aria-describedby']).toBe(alert!.props.id);
  });
});

describe('ApplyForm のエラー表示', () => {
  it('多言語の項目は言語名つきで示し、チェックボックス群も aria-invalid になる', () => {
    const dict = getDictionary('en');
    preset = { status: 'invalid', invalid: ['categories', 'supportedLanguages', 'name_en', 'contactEmail'] };
    const els = flatten(ApplyForm({ locale: 'en', dict, categories: INITIAL_CATEGORIES }));
    preset = undefined;

    const alert = els.find((e) => e.props.role === 'alert')!;
    const message = text(alert.props.children);
    expect(message).toContain(dict.apply.invalidFields);
    expect(message).toContain(dict.detail.languages);
    expect(message).toContain(dict.search.category);
    expect(message).toContain(`${dict.apply.serviceName} (English)`);
    expect(message).toContain(dict.apply.contactEmail);
    expect(message).not.toContain(dict.apply.contactName);
    const invalid = invalidControls(els);
    expect(invalid.filter((n) => n === 'supportedLanguages')).toHaveLength(SUPPORTED_LOCALES.length);
    expect(invalid.filter((n) => n === 'categories')).toHaveLength(INITIAL_CATEGORIES.length);
    expect(new Set(invalid)).toEqual(new Set(['categories', 'supportedLanguages', 'name_en', 'contactEmail']));
  });

  it('エラーが無いときは aria-invalid を付けない', () => {
    const els = flatten(ApplyForm({ locale: 'en', dict: getDictionary('en'), categories: INITIAL_CATEGORIES }));
    expect(invalidControls(els)).toEqual([]);
    expect(els.find((e) => e.props.role === 'alert')).toBeUndefined();
  });
});
