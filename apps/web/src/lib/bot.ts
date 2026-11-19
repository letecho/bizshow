import path from 'node:path';
import type { SupportedLocale } from '@fss/shared/domain';
import { loadMarkdownDocument, type LegalDocument } from './legal';

/** ボット説明ページの本文（apps/web/content/bot/bot.{locale}.md、F-116） */
export const BOT_CONTENT_DIR = path.join(process.cwd(), 'content', 'bot');

/** 本文中の {{contactUrl}} を表示言語のお問い合わせページに置き換える（フォールバックした本文でも言語を保つ） */
export function fillBotPlaceholders(markdown: string, locale: SupportedLocale): string {
  return markdown.replaceAll('{{contactUrl}}', `/${locale}/contact`);
}

export async function loadBotDocument(locale: SupportedLocale, dir: string = BOT_CONTENT_DIR): Promise<LegalDocument> {
  const doc = await loadMarkdownDocument(dir, 'bot', locale);
  return { ...doc, markdown: fillBotPlaceholders(doc.markdown, locale) };
}
