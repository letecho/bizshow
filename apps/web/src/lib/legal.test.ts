import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import { SUPPORTED_LOCALES } from '@fss/shared/domain';
import { LEGAL_CONTENT_DIR, LEGAL_PAGES, isLegalPage, legalFallbackChain, loadLegalDocument } from './legal';

describe('legalFallbackChain', () => {
  it('tries the requested locale, then en, then ja', () => {
    expect(legalFallbackChain('vi')).toEqual(['vi', 'en', 'ja']);
    expect(legalFallbackChain('en')).toEqual(['en', 'ja']);
    expect(legalFallbackChain('ja')).toEqual(['ja', 'en']);
  });
});

describe('isLegalPage', () => {
  it('accepts only known pages', () => {
    expect(isLegalPage('terms')).toBe(true);
    expect(isLegalPage('cookies')).toBe(false);
  });
});

describe('loadLegalDocument', () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'legal-'));
    await writeFile(path.join(dir, 'terms.vi.md'), '# vi');
    await writeFile(path.join(dir, 'terms.en.md'), '# en');
    await writeFile(path.join(dir, 'privacy.ja.md'), '# ja');
  });

  it('returns the requested locale when present', async () => {
    await expect(loadLegalDocument('terms', 'vi', dir)).resolves.toEqual({ markdown: '# vi', locale: 'vi' });
  });

  it('falls back to en when the locale is missing', async () => {
    await expect(loadLegalDocument('terms', 'ja', dir)).resolves.toEqual({ markdown: '# en', locale: 'en' });
  });

  it('falls back to ja when en is also missing', async () => {
    await expect(loadLegalDocument('privacy', 'vi', dir)).resolves.toEqual({ markdown: '# ja', locale: 'ja' });
  });

  it('throws when no file exists', async () => {
    await expect(loadLegalDocument('tokushoho', 'en', dir)).rejects.toThrow('not found');
  });

  it('has content for every page in every locale (with fallback) in the repo', async () => {
    for (const page of LEGAL_PAGES) {
      for (const locale of SUPPORTED_LOCALES) {
        const doc = await loadLegalDocument(page, locale, LEGAL_CONTENT_DIR);
        expect(doc.markdown.trim().length).toBeGreaterThan(0);
      }
    }
  });

  // F-119: データ収集に伴う改定（掲載情報の取得方法と出典・掲載情報について）を全対応言語で表示する
  it('has the revised privacy policy and terms in all supported languages (F-119)', async () => {
    const markers: Record<'privacy' | 'terms', Record<string, string[]>> = {
      privacy: {
        ja: ['掲載情報の取得方法と出典', 'robots.txt', '30 日', '7 日以内', '本人の同意を得た場合に限り掲載', '改定日: 2026年11月19日'],
        en: ['How we obtain listing information and sources', 'robots.txt', '30 days', 'within 7 days', "only with that person's consent", 'Last revised: 2026-11-19'],
        vi: ['Cách thu thập thông tin đăng và nguồn', 'robots.txt', '30 ngày', '7 ngày', 'chỉ được đăng khi có sự đồng ý', 'Ngày sửa đổi: 2026-11-19'],
      },
      terms: {
        ja: ['掲載情報について', '推薦・評価・品質の保証を意味するものではありません', '改定日: 2026年11月19日'],
        en: ['About listings', 'recommends, rates or guarantees', 'Last revised: 2026-11-19'],
        vi: ['Về thông tin đăng', 'giới thiệu, đánh giá hay bảo đảm chất lượng', 'Ngày sửa đổi: 2026-11-19'],
      },
    };
    for (const page of ['privacy', 'terms'] as const) {
      for (const locale of SUPPORTED_LOCALES) {
        const doc = await loadLegalDocument(page, locale, LEGAL_CONTENT_DIR);
        expect(doc.locale).toBe(locale);
        for (const marker of markers[page][locale]) expect(doc.markdown).toContain(marker);
      }
    }
  });
});
