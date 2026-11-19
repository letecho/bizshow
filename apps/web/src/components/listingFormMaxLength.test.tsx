import { describe, it, expect, vi } from 'vitest';
import { isValidElement, type ReactNode } from 'react';
import { LISTING_TEXT_MAX, ListingFieldsSchema, SLUG_MAX, SlugSchema } from '@fss/shared/domain';
import { getDictionary } from '../i18n/dictionaries';

// B-011: 掲載フォームの文字入力欄に共通スキーマと同じ上限（maxLength）がある

// フォームを関数として呼んで要素ツリーを得るため、フックは初期値を返すだけにする
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: <T,>(init: T) => [init, () => {}],
    useActionState: <T,>(_action: unknown, init: T) => [init, () => {}, false],
  };
});

const { ApplyForm } = await import('./ApplyForm');
const { ServiceForm } = await import('./admin/ServiceForm');

type ControlProps = { name?: string; type?: string; maxLength?: number; children?: ReactNode };

/** 要素ツリー（関数コンポーネントは展開）から name → maxLength（未設定は null）を集める */
function maxLengths(node: ReactNode, result: Record<string, number | null> = {}): Record<string, number | null> {
  if (Array.isArray(node)) {
    node.forEach((n) => maxLengths(n, result));
    return result;
  }
  if (!isValidElement<ControlProps>(node)) return result;
  if (typeof node.type === 'function') return maxLengths((node.type as (p: unknown) => ReactNode)(node.props), result);
  const { name, type, maxLength } = node.props;
  const skip = type === 'checkbox' || type === 'file' || type === 'hidden' || name === 'website';
  if ((node.type === 'input' || node.type === 'textarea') && name && !skip) result[name] = maxLength ?? null;
  return maxLengths(node.props.children, result);
}

const localized = (field: 'name' | 'description' | 'address') =>
  Object.fromEntries(['ja', 'en', 'vi'].map((l) => [`${field}_${l}`, LISTING_TEXT_MAX[field]]));

const listingFields = {
  city: LISTING_TEXT_MAX.city,
  phone: LISTING_TEXT_MAX.phone,
  websiteUrl: LISTING_TEXT_MAX.websiteUrl,
  ...localized('name'),
  ...localized('description'),
  ...localized('address'),
};

describe('listing form maxLength matches the shared schema (B-011)', () => {
  it('limits are the ones the schema enforces', () => {
    const base = { category: 'legal', prefecture: 'tokyo', supportedLanguages: ['en'], name: { en: 'a' }, description: { en: 'a' } };
    for (const field of ['name', 'description', 'address'] as const) {
      const at = { ...base, [field]: { en: 'a'.repeat(LISTING_TEXT_MAX[field]) } };
      const over = { ...base, [field]: { en: 'a'.repeat(LISTING_TEXT_MAX[field] + 1) } };
      expect(ListingFieldsSchema.safeParse(at).success).toBe(true);
      expect(ListingFieldsSchema.safeParse(over).success).toBe(false);
    }
    expect(ListingFieldsSchema.safeParse({ ...base, city: 'a'.repeat(LISTING_TEXT_MAX.city + 1) }).success).toBe(false);
    expect(SlugSchema.safeParse('a'.repeat(SLUG_MAX)).success).toBe(true);
    expect(SlugSchema.safeParse('a'.repeat(SLUG_MAX + 1)).success).toBe(false);
  });

  it('apply form', () => {
    expect(maxLengths(ApplyForm({ locale: 'en', dict: getDictionary('en') }))).toEqual({
      ...listingFields,
      contactName: 100,
      contactEmail: 254,
    });
  });

  it('admin service form', () => {
    expect(maxLengths(ServiceForm({ action: async (s) => s }))).toEqual({ slug: SLUG_MAX, ...listingFields });
  });
});
