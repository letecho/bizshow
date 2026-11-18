import { describe, it, expect } from 'vitest';
import { negotiateLocale } from './negotiate';
import { getDictionary } from './dictionaries';
import { switchLocalePath } from './config';
import en from './dictionaries/en.json';

describe('negotiateLocale', () => {
  it.each([
    ['vi', 'vi'],
    ['vi-VN,vi;q=0.9,en;q=0.8', 'vi'],
    ['fr-FR,fr;q=0.9,zh-CN;q=0.8,en;q=0.5', 'zh'],
    ['en;q=0.5,ja;q=0.9', 'ja'],
    ['fr,de', 'en'],
    ['', 'en'],
    [null, 'en'],
  ])('%s → %s', (header, expected) => {
    expect(negotiateLocale(header)).toBe(expected);
  });
});

describe('getDictionary', () => {
  it('returns the locale dictionary', () => {
    expect(getDictionary('ja').header.language).toBe('言語');
  });

  it('has every en key in all locales after fallback', () => {
    for (const locale of ['ja', 'zh', 'vi'] as const) {
      const dict = getDictionary(locale);
      expect(Object.keys(dict)).toEqual(Object.keys(en));
      expect(Object.keys(dict.site)).toEqual(Object.keys(en.site));
    }
  });
});

describe('switchLocalePath', () => {
  it('replaces only the locale segment', () => {
    expect(switchLocalePath('/ja', 'vi')).toBe('/vi');
    expect(switchLocalePath('/ja/services/clinic', 'en')).toBe('/en/services/clinic');
  });
});
