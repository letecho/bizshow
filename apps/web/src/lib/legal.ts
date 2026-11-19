import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { SupportedLocale } from '@fss/shared/domain';

export const LEGAL_PAGES = ['terms', 'privacy', 'tokushoho'] as const;
export type LegalPage = (typeof LEGAL_PAGES)[number];

export function isLegalPage(value: unknown): value is LegalPage {
  return typeof value === 'string' && (LEGAL_PAGES as readonly string[]).includes(value);
}

/** 本文 Markdown の置き場所（apps/web/content/legal/{page}.{locale}.md） */
export const LEGAL_CONTENT_DIR = path.join(process.cwd(), 'content', 'legal');

/** 指定言語 → en → ja の順に探す */
export function legalFallbackChain(locale: SupportedLocale): SupportedLocale[] {
  return [...new Set<SupportedLocale>([locale, 'en', 'ja'])];
}

export interface LegalDocument {
  markdown: string;
  /** 実際に読み込んだ言語（フォールバック時は locale と異なる） */
  locale: SupportedLocale;
}

export async function loadLegalDocument(
  page: LegalPage,
  locale: SupportedLocale,
  dir: string = LEGAL_CONTENT_DIR,
): Promise<LegalDocument> {
  return loadMarkdownDocument(dir, page, locale);
}

/** content/ 配下の {name}.{locale}.md を指定言語 → en → ja の順に読む（法務ページ・ボット説明ページで共用） */
export async function loadMarkdownDocument(dir: string, name: string, locale: SupportedLocale): Promise<LegalDocument> {
  for (const candidate of legalFallbackChain(locale)) {
    try {
      const markdown = await readFile(path.join(dir, `${name}.${candidate}.md`), 'utf8');
      return { markdown, locale: candidate };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
  throw new Error(`Document not found: ${name}`);
}
