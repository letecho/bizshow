import { describe, it, expect, vi } from 'vitest';
import { isValidElement, type ReactNode } from 'react';
import type { ListingInvitePrefill } from '@fss/shared/outreach';
import { getDictionary } from '../i18n/dictionaries';

// F-118: 掲載案内のリンクから来たとき、掲載申請フォームに候補の内容が入る

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useState: <T,>(init: T) => [init, () => {}] };
});

const { ApplyForm } = await import('./ApplyForm');

type ControlProps = {
  name?: string;
  type?: string;
  value?: string;
  defaultValue?: string;
  defaultChecked?: boolean;
  children?: ReactNode;
};

/** 要素ツリーから name（チェックボックスは name=value）→ 初期値を集める */
function defaults(node: ReactNode, result: Record<string, unknown> = {}): Record<string, unknown> {
  if (Array.isArray(node)) {
    node.forEach((n) => defaults(n, result));
    return result;
  }
  if (!isValidElement<ControlProps>(node)) return result;
  if (typeof node.type === 'function') return defaults((node.type as (p: unknown) => ReactNode)(node.props), result);
  const { name, type, value, defaultValue, defaultChecked } = node.props;
  if (name && (node.type === 'input' || node.type === 'textarea' || node.type === 'select')) {
    if (type === 'checkbox') result[`${name}=${value}`] = defaultChecked ?? false;
    else result[name] = defaultValue;
  }
  return defaults(node.props.children, result);
}

const prefill: ListingInvitePrefill = {
  category: 'medical',
  prefecture: 'aichi',
  city: '名古屋市',
  supportedLanguages: ['ja', 'vi'],
  name: { ja: 'テスト病院', en: 'Test Hospital' },
  address: { ja: '中区1-2-3' },
  phone: '052-000-0000',
  websiteUrl: 'https://hospital.example/',
};

describe('ApplyForm with an invite (F-118)', () => {
  const dict = getDictionary('ja');

  it('fills in the candidate details', () => {
    const values = defaults(ApplyForm({ locale: 'ja', dict, initial: prefill }));
    expect(values).toMatchObject({
      category: 'medical',
      prefecture: 'aichi',
      city: '名古屋市',
      name_ja: 'テスト病院',
      name_en: 'Test Hospital',
      address_ja: '中区1-2-3',
      phone: '052-000-0000',
      websiteUrl: 'https://hospital.example/',
      'supportedLanguages=ja': true,
      'supportedLanguages=vi': true,
      'supportedLanguages=en': false,
    });
    // 説明と担当者は事業者が入力する
    expect(values.description_en).toBeUndefined();
    expect(values.contactEmail).toBeUndefined();
  });

  it('leaves the form empty without an invite', () => {
    const values = defaults(ApplyForm({ locale: 'ja', dict }));
    expect(values).toMatchObject({ category: '', prefecture: '', name_ja: undefined, 'supportedLanguages=ja': false });
  });

  it('has the invite and opt-out texts in all four languages', () => {
    for (const locale of ['ja', 'en', 'zh', 'vi'] as const) {
      const d = getDictionary(locale);
      for (const text of [d.apply.inviteLoaded, d.apply.inviteInvalid, ...Object.values(d.optOut)]) expect(text).toBeTruthy();
    }
  });
});
