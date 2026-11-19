import { isSupportedLocale, type SupportedLocale, type WebsiteLanguageSignal } from '@fss/shared';

/**
 * HTML から対応言語の手がかりとリンクを取り出す（依存を増やさない簡易パーサー）。
 * 取り出した文章は判定だけに使い、掲載には使わない（転載しない）。
 */

export interface LanguageHint {
  lang: SupportedLocale;
  signal: WebsiteLanguageSignal;
  /** 手がかりがあったページの URL */
  url: string;
}

export interface PageLink {
  url: URL;
  text: string;
  hreflang?: string;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1]?.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  // タグ名を飛ばす
  const body = tag.replace(/^<\s*[a-zA-Z0-9]+/, '').replace(/\/?>$/, '');
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) out[m[1]!.toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  return out;
}

/** 言語タグ（BCP 47）を対応言語に。対応外は undefined */
export function localeFromTag(tag: string | undefined): SupportedLocale | undefined {
  const t = (tag ?? '').trim().toLowerCase().replace('_', '-');
  const primary = t.split('-')[0];
  return isSupportedLocale(primary) ? primary : undefined;
}

/** 言語切替のリンクの文言（自言語名・英語名・日本語名） */
const LANGUAGE_NAMES: { lang: SupportedLocale; re: RegExp }[] = [
  { lang: 'vi', re: /^(ti[eế]ng\s*vi[eệ]t|vietnamese|ベトナム語|越南[语語]|vn|vi)$/i },
  { lang: 'en', re: /^(english|英語|英语|en)$/i },
  { lang: 'ja', re: /^(日本語|japanese|jp|ja)$/i },
];

/** パスの先頭の言語（/en/, /vi/ など） */
const PATH_LANGS: Record<string, SupportedLocale> = {
  en: 'en',
  'en-us': 'en',
  'en-gb': 'en',
  vi: 'vi',
  vn: 'vi',
  ja: 'ja',
  jp: 'ja',
};

export function localeFromPath(pathname: string): SupportedLocale | undefined {
  const first = pathname.toLowerCase().split('/').filter(Boolean)[0];
  return first ? PATH_LANGS[first] : undefined;
}

function languageFromLinkText(text: string): SupportedLocale | undefined {
  const t = text.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 30) return undefined;
  return LANGUAGE_NAMES.find((n) => n.re.test(t))?.lang;
}

function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/** ベトナム語に特有の字（ă・â・ê・ô・ơ・ư・đ と、声調付きの母音のうち他言語でまず使わないもの） */
const VI_CHARS = /[ăâêôơưđạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/gi;
const KANA = /[぀-ヿ]/g;

/** 本文の言語の簡易判定（誤判定を避けるため、ベトナム語と日本語だけを判定する） */
export function bodyLanguages(text: string): SupportedLocale[] {
  const out: SupportedLocale[] = [];
  if ((text.match(VI_CHARS) ?? []).length >= 15) out.push('vi');
  if ((text.match(KANA) ?? []).length >= 20) out.push('ja');
  return out;
}

export interface ParsedPage {
  hints: LanguageHint[];
  links: PageLink[];
}

/** HTML から言語の手がかりと同一ホストのリンクを取り出す */
export function parsePage(html: string, pageUrl: URL): ParsedPage {
  const hints: LanguageHint[] = [];
  const url = pageUrl.toString();
  const add = (lang: SupportedLocale | undefined, signal: WebsiteLanguageSignal, at = url) => {
    if (lang && !hints.some((h) => h.lang === lang && h.signal === signal)) hints.push({ lang, signal, url: at });
  };

  const htmlTag = html.match(/<html\b[^>]*>/i)?.[0];
  if (htmlTag) add(localeFromTag(attrs(htmlTag).lang), 'html_lang');
  add(localeFromPath(pageUrl.pathname), 'path');

  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const a = attrs(tag);
    if ((a.rel ?? '').toLowerCase().split(/\s+/).includes('alternate') && a.hreflang) add(localeFromTag(a.hreflang), 'hreflang');
  }

  const links: PageLink[] = [];
  const anchorRe = /<a\b[^>]*>([\s\S]*?)<\/a\s*>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html))) {
    const a = attrs(m[0].match(/^<a\b[^>]*>/i)![0]);
    if (!a.href) continue;
    let target: URL;
    try {
      target = new URL(a.href, pageUrl);
    } catch {
      continue;
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') continue;
    target.hash = '';
    const text = stripTags(m[1] ?? '') || a.title || a['aria-label'] || '';
    links.push({ url: target, text, hreflang: a.hreflang });
    // 言語切替: hreflang 付きのリンク、言語名のリンク
    const switchLang = localeFromTag(a.hreflang) ?? languageFromLinkText(text);
    if (switchLang) add(switchLang, 'switch_link', target.toString());
  }

  for (const lang of bodyLanguages(stripTags(html))) add(lang, 'body_text');
  return { hints, links };
}

/** 取得しないページ（ログイン・フォーム・検索・ファイルなど） */
const SKIP_PATH = /(login|logout|signin|sign-in|signup|register|cart|checkout|admin|wp-admin|wp-login|account|mypage|search|form|\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|pptx?|mp4|mp3)$)/i;
const INFO_LINK = /(about|company|corporate|profile|overview|access|map|contact|inquiry|会社概要|会社案内|企業情報|法人概要|病院概要|医院概要|事務所概要|概要|アクセス|交通|所在地|お問い?合わ?せ|連絡先)/i;

function sameSite(a: URL, b: URL): boolean {
  const strip = (h: string) => h.toLowerCase().replace(/^www\./, '');
  return strip(a.hostname) === strip(b.hostname);
}

/**
 * トップページのリンクから追加で取得するページを選ぶ。
 * 同一サイト・クエリなし・ログイン等でないもの。言語切替 → 会社概要・アクセス・お問い合わせの順。
 */
export function selectFollowLinks(links: readonly PageLink[], top: URL, max: number): URL[] {
  if (max <= 0) return [];
  const seen = new Set<string>([top.toString()]);
  const scored: { url: URL; priority: number; order: number }[] = [];
  links.forEach((l, order) => {
    if (!sameSite(l.url, top) || l.url.protocol !== top.protocol) return;
    if (l.url.search || l.url.username || l.url.password) return;
    if (SKIP_PATH.test(l.url.pathname)) return;
    const key = l.url.toString();
    if (seen.has(key)) return;
    seen.add(key);
    const isSwitch = Boolean(localeFromTag(l.hreflang) ?? languageFromLinkText(l.text)) || Boolean(localeFromPath(l.url.pathname) && localeFromPath(l.url.pathname) !== 'ja');
    const isInfo = INFO_LINK.test(l.text) || INFO_LINK.test(l.url.pathname);
    if (!isSwitch && !isInfo) return;
    scored.push({ url: l.url, priority: isSwitch ? 0 : 1, order });
  });
  return scored
    .sort((a, b) => a.priority - b.priority || a.order - b.order)
    .slice(0, max)
    .map((s) => s.url);
}
