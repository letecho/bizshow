import { describe, it, expect } from 'vitest';
import { SUPPORTED_LOCALES } from '@fss/shared/domain';
import { getDictionary } from '../i18n/dictionaries';
import { notFoundMessages } from './notFound';

// B-007: 404 のページタイトルが「ページが見つかりません | サイト名」になる
describe('notFoundMessages', () => {
  it('builds a localized document title for every locale', () => {
    const messages = notFoundMessages();
    expect(messages.ja.documentTitle).toBe('ページが見つかりません | 在日外国人向けサービス検索');
    for (const locale of SUPPORTED_LOCALES) {
      const dict = getDictionary(locale);
      expect(messages[locale].documentTitle).toBe(`${dict.notFound.title} | ${dict.site.title}`);
      expect(messages[locale].title).toBe(dict.notFound.title);
    }
  });
});
