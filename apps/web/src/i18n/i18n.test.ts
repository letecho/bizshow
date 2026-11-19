import { describe, it, expect } from 'vitest';
import { negotiateLocale } from './negotiate';
import { getDictionary } from './dictionaries';
import { switchLocalePath } from './config';
import en from './dictionaries/en.json';
import ja from './dictionaries/ja.json';
import vi from './dictionaries/vi.json';

const raw = { ja, vi };

describe('negotiateLocale', () => {
  it.each([
    ['vi', 'vi'],
    ['vi-VN,vi;q=0.9,en;q=0.8', 'vi'],
    ['fr-FR,fr;q=0.9,vi-VN;q=0.8,en;q=0.5', 'vi'],
    // F-120: 中国語は対応外（次に優先度の高い対応言語、無ければ en）
    ['zh-CN,zh;q=0.9,ja;q=0.5', 'ja'],
    ['zh-TW', 'en'],
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
    // categories / search も含め全セクションのキーが揃うこと
    for (const locale of ['ja', 'vi'] as const) {
      const dict = getDictionary(locale);
      expect(Object.keys(dict)).toEqual(Object.keys(en));
      for (const section of Object.keys(en) as (keyof typeof en)[]) {
        expect(Object.keys(dict[section])).toEqual(Object.keys(en[section]));
        // 各言語の JSON 自体にも全キーがある（未翻訳が無い）
        expect(Object.keys((raw[locale] as typeof en)[section] ?? {})).toEqual(Object.keys(en[section]));
      }
    }
  });
});

describe('switchLocalePath', () => {
  it('replaces only the locale segment', () => {
    expect(switchLocalePath('/ja', 'vi')).toBe('/vi');
    expect(switchLocalePath('/ja/services/clinic', 'en')).toBe('/en/services/clinic');
  });
});

describe('labels', () => {
  it('prefectureName uses ja for ja and en otherwise', async () => {
    const { prefectureName } = await import('./labels');
    expect(prefectureName('tokyo', 'ja')).toBe('東京都');
    expect(prefectureName('tokyo', 'vi')).toBe('Tokyo');
    expect(prefectureName('unknown', 'en')).toBe('unknown');
  });

  it('format fills placeholders', async () => {
    const { format } = await import('./labels');
    expect(format('{total} 件', { total: 3 })).toBe('3 件');
  });
});
