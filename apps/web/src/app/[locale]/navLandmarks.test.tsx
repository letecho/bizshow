import { describe, it, expect } from 'vitest';
import { isValidElement, type ReactNode } from 'react';
import { SUPPORTED_LOCALES } from '@fss/shared/domain';
import LocaleLayout from './layout';
import { Pagination } from '../../components/Pagination';
import { getDictionary } from '../../i18n/dictionaries';

// B-010: nav ランドマークの名前が表示言語の辞書から付く（CLAUDE.md ルール 3、WCAG 2.2 SC 1.3.1 / 2.4.1）
type NavProps = { 'aria-label'?: string; children?: ReactNode };

/** 要素ツリー（組み込み要素のみ）から nav の aria-label を集める（名前なしは null） */
function navLabels(node: ReactNode): (string | null)[] {
  if (Array.isArray(node)) return node.flatMap(navLabels);
  if (!isValidElement<NavProps>(node)) return [];
  const self = node.type === 'nav' ? [node.props['aria-label'] ?? null] : [];
  return [...self, ...navLabels(node.props.children)];
}

describe('nav landmarks are named in the page language (B-010)', () => {
  it.each(SUPPORTED_LOCALES)('footer nav in %s', async (locale) => {
    const element = await LocaleLayout({ children: null, params: Promise.resolve({ locale }) });
    const labels = navLabels(element);
    expect(labels).toEqual([getDictionary(locale).footer.nav]);
    expect(labels).not.toContain('legal');
  });

  it('dictionary labels differ per language', () => {
    expect(getDictionary('ja').footer.nav).not.toBe(getDictionary('en').footer.nav);
    expect(getDictionary('ja').search.pagination).not.toBe(getDictionary('en').search.pagination);
  });

  it('pagination nav has the given label', () => {
    const dict = getDictionary('ja');
    const element = Pagination({
      basePath: '/ja',
      query: '',
      page: 1,
      limit: 5,
      total: 24,
      labels: { prev: dict.search.prev, next: dict.search.next, nav: dict.search.pagination },
    });
    expect(navLabels(element)).toEqual(['検索結果のページ']);
  });
});
