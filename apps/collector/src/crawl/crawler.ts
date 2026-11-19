import type { CollectorConfig } from '@fss/shared';
import type { Fetcher, FetchResult } from './fetcher';
import { MAX_REDIRECTS } from './fetcher';
import { htmlToText, type PageText } from '../llm/extract';
import { parsePage, selectFollowLinks, type LanguageHint } from './html';
import { ALLOW_ALL, parseRobots, type RobotsRules } from './robots';
import type { CrawlStateData, PageRecord } from './state';

const DAY_MS = 24 * 60 * 60 * 1000;
/** 429 / 503 を受けたホストの停止時間 */
export const SUSPEND_MS = DAY_MS;

export type SiteCrawlStatus =
  /** 取得できた（一部のページの失敗を含む） */
  | 'crawled'
  /** 429 / 503 でこの実行中または 24 時間以内に停止 */
  | 'suspended'
  /** robots.txt が 5xx・取得できない → 中止 */
  | 'robots_unavailable'
  /** トップページが robots.txt で禁止 */
  | 'disallowed'
  /** SSRF 対策・形式などで拒否、またはトップページを取得できなかった */
  | 'failed';

export interface SiteCrawlResult {
  status: SiteCrawlStatus;
  hints: LanguageHint[];
  /** 実際に HTTP で取得したページ数（robots.txt・リダイレクトの応答を含まない） */
  pagesFetched: number;
  /** HTTP リクエスト数（robots.txt・リダイレクトを含む） */
  requests: number;
  /** この実行で取得したページの本文（タグ除去済み。LLM の抽出用、F-117）。記録を使ったページは含まない */
  pages: PageText[];
  error?: string;
}

export interface CrawlerDeps {
  config: Pick<CollectorConfig['crawl'], 'maxPages' | 'intervalSec' | 'recrawlDays' | 'userAgent'>;
  fetcher: Fetcher;
  /** 取得記録・停止中のホスト（呼び出し側が保存する） */
  state: CrawlStateData;
  saveRaw: (url: string, body: string, now: Date) => Promise<unknown>;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function sameSite(a: URL, b: URL): boolean {
  const strip = (h: string) => h.toLowerCase().replace(/^www\./, '');
  return a.protocol === b.protocol && strip(a.hostname) === strip(b.hostname) && a.port === b.port;
}

function mergeHints(into: LanguageHint[], more: readonly LanguageHint[]) {
  for (const h of more) if (!into.some((x) => x.lang === h.lang && x.signal === h.signal)) into.push(h);
}

/**
 * 公式サイトを 1 つずつ取得する。同一ホストへのリクエストは逐次（同時 1）で、
 * 間隔は max(COLLECTOR_CRAWL_INTERVAL_SEC, Crawl-delay)。robots.txt を守り、429 / 503 でホストを 24 時間止める。
 */
export class Crawler {
  private readonly lastRequestAt = new Map<string, number>();
  private readonly robots = new Map<string, RobotsRules | 'unavailable' | 'suspended' | 'failed'>();
  private readonly now: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly deps: CrawlerDeps) {
    this.now = deps.now ?? (() => new Date());
    this.sleep = deps.sleep ?? realSleep;
  }

  isSuspended(host: string): boolean {
    const until = this.deps.state.suspendedHosts[host.toLowerCase()];
    return Boolean(until && Date.parse(until) > this.now().getTime());
  }

  private suspend(host: string) {
    this.deps.state.suspendedHosts[host.toLowerCase()] = new Date(this.now().getTime() + SUSPEND_MS).toISOString();
  }

  private intervalMs(rules: RobotsRules | undefined): number {
    return Math.max(this.deps.config.intervalSec, rules?.crawlDelaySec ?? 0) * 1000;
  }

  /** 同一ホストの前回のリクエストから間隔を空けて取得する */
  private async request(url: URL, rules: RobotsRules | undefined, accept: 'html' | 'text', record?: PageRecord): Promise<FetchResult> {
    const host = url.host.toLowerCase();
    const last = this.lastRequestAt.get(host);
    if (last !== undefined) {
      const wait = last + this.intervalMs(rules) - this.now().getTime();
      if (wait > 0) await this.sleep(wait);
    }
    this.lastRequestAt.set(host, this.now().getTime());
    return this.deps.fetcher({
      url,
      userAgent: this.deps.config.userAgent,
      accept,
      etag: record?.etag,
      lastModified: record?.lastModified,
    });
  }

  private async loadRobots(origin: URL, counter: { requests: number }): Promise<RobotsRules | 'unavailable' | 'suspended' | 'failed'> {
    const key = origin.origin;
    const cached = this.robots.get(key);
    if (cached) return cached;
    let url = new URL('/robots.txt', origin);
    let result: RobotsRules | 'unavailable' | 'suspended' | 'failed' = 'unavailable';
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      counter.requests += 1;
      const res = await this.request(url, undefined, 'text');
      if (res.kind === 'redirect') {
        if (!sameSite(res.location, origin)) {
          result = ALLOW_ALL; // 別サイトの robots.txt は適用しない（RFC 9309 では追ってよいが、ここでは許可扱い）
          break;
        }
        url = res.location;
        continue;
      }
      if (res.kind === 'ok') result = parseRobots(res.body, this.deps.config.userAgent);
      else if (res.kind === 'http_error' && (res.status === 429 || res.status === 503)) {
        this.suspend(origin.host);
        result = 'suspended';
      } else if (res.kind === 'http_error' && res.status >= 400 && res.status < 500) result = ALLOW_ALL;
      else if (res.kind === 'rejected') result = 'failed';
      else result = 'unavailable'; // 5xx・通信エラー → 中止
      break;
    }
    this.robots.set(key, result);
    return result;
  }

  /** 1 ページを取得（リダイレクトはホスト内で 3 回まで、各ホップで robots.txt を確認） */
  private async fetchPage(
    start: URL,
    rules: RobotsRules,
    counter: { requests: number; pages: number },
  ): Promise<{ kind: 'ok'; url: URL; body: string; etag?: string; lastModified?: string } | { kind: 'not_modified' } | { kind: 'stop'; reason: string; suspended?: boolean }> {
    let url = start;
    const record = this.recentRecord(start, Infinity);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!rules.isAllowed(url.pathname + url.search)) return { kind: 'stop', reason: 'disallowed by robots.txt' };
      counter.requests += 1;
      const res = await this.request(url, rules, 'html', hop === 0 ? record : undefined);
      if (res.kind === 'redirect') {
        if (!sameSite(res.location, start)) return { kind: 'stop', reason: 'cross-site redirect' };
        url = res.location;
        continue;
      }
      if (res.kind === 'ok') {
        counter.pages += 1;
        return { kind: 'ok', url: res.url, body: res.body, etag: res.etag, lastModified: res.lastModified };
      }
      if (res.kind === 'not_modified') return { kind: 'not_modified' };
      if (res.kind === 'http_error' && (res.status === 429 || res.status === 503)) {
        this.suspend(url.host);
        return { kind: 'stop', reason: `HTTP ${res.status}`, suspended: true };
      }
      if (res.kind === 'http_error') return { kind: 'stop', reason: `HTTP ${res.status}` };
      if (res.kind === 'rejected') return { kind: 'stop', reason: res.reason };
      return { kind: 'stop', reason: 'network error' };
    }
    return { kind: 'stop', reason: 'too many redirects' };
  }

  /** COLLECTOR_RECRAWL_DAYS 以内の取得記録 */
  private recentRecord(url: URL, maxAgeMs = this.deps.config.recrawlDays * DAY_MS): PageRecord | undefined {
    const rec = this.deps.state.pages[url.toString()];
    if (!rec) return undefined;
    return this.now().getTime() - Date.parse(rec.fetchedAt) < maxAgeMs ? rec : undefined;
  }

  /** 1 ページ分の処理: 再取得の間隔内なら記録を使い、そうでなければ取得して手がかりを記録する */
  private async visit(
    url: URL,
    rules: RobotsRules,
    counter: { requests: number; pages: number },
  ): Promise<{ record: PageRecord; links?: ReturnType<typeof parsePage>['links']; finalUrl: URL; text?: string } | { stop: string; suspended?: boolean }> {
    const recent = this.recentRecord(url);
    if (recent) return { record: recent, finalUrl: url };
    const res = await this.fetchPage(url, rules, counter);
    const fetchedAt = this.now();
    if (res.kind === 'stop') return { stop: res.reason, suspended: res.suspended };
    const key = url.toString();
    if (res.kind === 'not_modified') {
      const prev = this.deps.state.pages[key]!;
      const record = { ...prev, fetchedAt: fetchedAt.toISOString() };
      this.deps.state.pages[key] = record;
      return { record, finalUrl: url };
    }
    await this.deps.saveRaw(res.url.toString(), res.body, fetchedAt);
    const parsed = parsePage(res.body, res.url);
    const record: PageRecord = {
      fetchedAt: fetchedAt.toISOString(),
      etag: res.etag,
      lastModified: res.lastModified,
      hints: parsed.hints,
    };
    this.deps.state.pages[key] = record;
    return { record, links: parsed.links, finalUrl: res.url, text: htmlToText(res.body) };
  }

  /** サイトを取得し、対応言語の手がかりを返す。取得はトップ＋言語切替・会社概要等のリンクで最大 COLLECTOR_CRAWL_MAX_PAGES */
  async crawlSite(start: URL): Promise<SiteCrawlResult> {
    const counter = { requests: 0, pages: 0 };
    const hints: LanguageHint[] = [];
    const pages: PageText[] = [];
    const out = (status: SiteCrawlStatus, error?: string): SiteCrawlResult => ({
      status,
      hints,
      pagesFetched: counter.pages,
      requests: counter.requests,
      pages,
      error,
    });
    if (start.protocol !== 'http:' && start.protocol !== 'https:') return out('failed', 'unsupported protocol');
    if (start.search) start = new URL(start.origin + start.pathname);
    if (this.isSuspended(start.host)) return out('suspended');

    const rules = await this.loadRobots(start, counter);
    if (rules === 'suspended') return out('suspended', 'robots.txt rate limited');
    if (rules === 'unavailable') return out('robots_unavailable');
    if (rules === 'failed') return out('failed', 'robots.txt rejected');
    if (!rules.isAllowed(start.pathname)) return out('disallowed');

    const top = await this.visit(start, rules, counter);
    if ('stop' in top) return out(top.suspended ? 'suspended' : 'failed', top.stop);
    mergeHints(hints, top.record.hints);
    if (top.text) pages.push({ url: top.finalUrl.toString(), text: top.text });

    // 追加取得先はトップページを取得したときに選び、記録を使うときは記録した一覧を使う
    let follow = top.record.follow?.map((u) => new URL(u));
    if (top.links) {
      // robots.txt で禁止のページは選ばない（上限の枠を使わない）
      const allowed = top.links.filter((l) => rules.isAllowed(l.url.pathname + l.url.search));
      follow = selectFollowLinks(allowed, top.finalUrl, this.deps.config.maxPages - 1);
      top.record.follow = follow.map((u) => u.toString());
    }
    for (const url of (follow ?? []).slice(0, this.deps.config.maxPages - 1)) {
      if (this.isSuspended(url.host)) break;
      const page = await this.visit(url, rules, counter);
      if ('stop' in page) {
        if (page.suspended) break;
        continue;
      }
      mergeHints(hints, page.record.hints);
      if (page.text) pages.push({ url: page.finalUrl.toString(), text: page.text });
    }
    return out('crawled');
  }
}
