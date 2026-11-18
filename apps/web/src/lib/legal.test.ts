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
    await expect(loadLegalDocument('terms', 'zh', dir)).resolves.toEqual({ markdown: '# en', locale: 'en' });
  });

  it('falls back to ja when en is also missing', async () => {
    await expect(loadLegalDocument('privacy', 'zh', dir)).resolves.toEqual({ markdown: '# ja', locale: 'ja' });
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
});
