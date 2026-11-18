import { describe, it, expect } from 'vitest';
import { SERVICE_CATEGORIES, SUPPORTED_LOCALES } from '@fss/shared';
import { SEED_LISTINGS } from '../db/seedData';
import { buildSearchText } from '../db/searchText';

describe('buildSearchText', () => {
  it('joins all languages of name and description in lower case', () => {
    expect(buildSearchText({ en: 'Clinic', ja: 'クリニック' }, { en: 'Open Daily' })).toBe('clinic クリニック open daily');
  });
});

describe('SEED_LISTINGS', () => {
  it('has 24 listings across 8 categories and 5 prefectures', () => {
    expect(SEED_LISTINGS).toHaveLength(24);
    expect(new Set(SEED_LISTINGS.map((l) => l.category))).toEqual(new Set(SERVICE_CATEGORIES));
    expect(new Set(SEED_LISTINGS.map((l) => l.prefecture))).toEqual(
      new Set(['tokyo', 'osaka', 'saitama', 'aichi', 'fukuoka']),
    );
    expect(new Set(SEED_LISTINGS.map((l) => l.slug)).size).toBe(24);
  });

  it('has name/description in all 4 languages and a generated searchText', () => {
    for (const l of SEED_LISTINGS) {
      for (const locale of SUPPORTED_LOCALES) {
        expect(l.name[locale]).toBeTruthy();
        expect(l.description[locale]).toBeTruthy();
      }
      expect(l.searchText).toBe(buildSearchText(l.name, l.description));
      expect(l.searchText).toBe(l.searchText.toLowerCase());
    }
  });
});
