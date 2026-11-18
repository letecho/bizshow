import { describe, it, expect } from 'vitest';
import {
  PREFECTURES,
  SERVICE_CATEGORIES,
  SUPPORTED_LOCALES,
  ServiceSearchQuerySchema,
  isSupportedLocale,
  pickText,
} from './domain';

describe('constants', () => {
  it('defines 4 locales, 8 categories and 47 prefectures', () => {
    expect(SUPPORTED_LOCALES).toEqual(['ja', 'en', 'zh', 'vi']);
    expect(SERVICE_CATEGORIES).toHaveLength(8);
    expect(PREFECTURES).toHaveLength(47);
    expect(new Set(PREFECTURES.map((p) => p.code)).size).toBe(47);
    expect(PREFECTURES.find((p) => p.code === 'tokyo')).toEqual({ code: 'tokyo', ja: '東京都', en: 'Tokyo' });
  });

  it('isSupportedLocale', () => {
    expect(isSupportedLocale('vi')).toBe(true);
    expect(isSupportedLocale('fr')).toBe(false);
    expect(isSupportedLocale(undefined)).toBe(false);
  });
});

describe('pickText', () => {
  it('falls back to en when the locale is missing', () => {
    expect(pickText({ en: 'A' }, 'vi')).toBe('A');
    expect(pickText({ en: 'A', vi: '' }, 'vi')).toBe('A');
  });

  it('returns the requested locale when present', () => {
    expect(pickText({ en: 'A', ja: 'エー' }, 'ja')).toBe('エー');
  });
});

describe('ServiceSearchQuerySchema', () => {
  it('applies defaults', () => {
    expect(ServiceSearchQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
  });

  it('coerces query-string values and treats empty strings as unset', () => {
    const parsed = ServiceSearchQuerySchema.parse({
      q: ' clinic ',
      category: 'legal',
      prefecture: '',
      lang: 'vi',
      page: '2',
      limit: '10',
    });
    expect(parsed).toEqual({ q: 'clinic', category: 'legal', lang: 'vi', page: 2, limit: 10 });
  });

  it.each([
    ['invalid category', { category: 'food' }],
    ['limit over 50', { limit: '51' }],
    ['limit 100', { limit: 100 }],
    ['page 0', { page: '0' }],
    ['unknown prefecture', { prefecture: 'paris' }],
    ['unsupported lang', { lang: 'fr' }],
    ['q over 100 chars', { q: 'a'.repeat(101) }],
  ])('rejects %s', (_label, input) => {
    expect(ServiceSearchQuerySchema.safeParse(input).success).toBe(false);
  });
});
