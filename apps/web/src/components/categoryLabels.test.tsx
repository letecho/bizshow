import { describe, it, expect } from 'vitest';
import { isValidElement, type ReactNode } from 'react';
import { INITIAL_CATEGORIES, type Category, type ServiceSummary } from '@fss/shared/domain';
import { getDictionary } from '../i18n/dictionaries';
import { SearchForm } from './SearchForm';
import { ServiceCard } from './ServiceCard';

// F-121: カテゴリ名は GET /api/v1/categories の名前を表示言語で出す（欠損は en）。追加したカテゴリも出る

const categories: Category[] = [...INITIAL_CATEGORIES, { code: 'pets', name: { en: 'Pets', ja: 'ペット' } }];

type Props = { name?: string; value?: string; type?: string; children?: ReactNode; className?: string };

function elements(node: ReactNode, out: { type: unknown; props: Props }[] = []) {
  if (Array.isArray(node)) {
    node.forEach((n) => elements(n, out));
    return out;
  }
  if (!isValidElement<Props>(node)) return out;
  out.push({ type: node.type, props: node.props });
  return elements(node.props.children, out);
}

function text(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  if (isValidElement<Props>(node)) return text(node.props.children);
  return '';
}

const service: ServiceSummary = {
  id: 's1',
  slug: 'pets-tokyo',
  categories: ['pets', 'daily'],
  prefecture: 'tokyo',
  city: null,
  supportedLanguages: ['ja', 'en'],
  name: { en: 'Pet Clinic' },
};

describe('SearchForm categories (F-121)', () => {
  const options = (locale: 'ja' | 'en' | 'vi', list: Category[], category?: string) => {
    const els = elements(SearchForm({ locale, dict: getDictionary(locale), values: { category }, categories: list }));
    const select = els.find((e) => e.type === 'select' && e.props.name === 'category');
    return { els, options: select ? elements(select.props.children).filter((e) => e.type === 'option') : null };
  };

  it('lists the categories from the API in the display language with en fallback', () => {
    for (const [locale, legal] of [
      ['ja', '法律・ビザ'],
      ['en', 'Legal & Visa'],
      ['vi', 'Pháp lý & Visa'],
    ] as const) {
      const opts = options(locale, categories).options!;
      expect(opts.map((o) => o.props.value)).toEqual(['', ...categories.map((c) => c.code)]);
      expect(text(opts[2].props.children)).toBe(legal);
      expect(text(opts.at(-1)!.props.children)).toBe(locale === 'ja' ? 'ペット' : 'Pets');
    }
  });

  it('hides the category select when the list is unavailable, keeping the current filter', () => {
    const { els, options: opts } = options('en', [], 'legal');
    expect(opts).toBeNull();
    expect(els.find((e) => e.type === 'input' && e.props.name === 'category')?.props).toMatchObject({ type: 'hidden', value: 'legal' });
  });
});

describe('ServiceCard category (F-121)', () => {
  it('shows the main (first) category name in each language', () => {
    const meta = (locale: 'ja' | 'en' | 'vi', list = categories) =>
      text(elements(ServiceCard({ service, locale, dict: getDictionary(locale), categories: list })).find((e) => e.type === 'p')!.props.children);
    expect(meta('ja')).toBe('ペット · 東京都');
    expect(meta('vi')).toMatch(/^Pets · /);
    // 一覧を取得できないときはコードのまま
    expect(meta('en', [])).toBe('pets · Tokyo');
  });
});
