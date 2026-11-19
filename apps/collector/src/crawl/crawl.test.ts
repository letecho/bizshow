import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBudgetedLlm,
  createMemoryLlmUsageStore,
  loadCollectorConfig,
  type CandidateExtract,
  type LanguageEvidence,
  type LlmClient,
  type LlmUsageEntry,
} from '@fss/shared';
import { createMemoryRepository } from '../testing';
import type { CandidateInput, DataSourceRecord } from '../types';
import { crawlMain } from './cli';
import { Crawler } from './crawler';
import { createNodeFetcher, type Fetcher } from './fetcher';
import { parsePage, selectFollowLinks } from './html';
import { parseRobots } from './robots';
import { runCrawl } from './run';
import { isPublicAddress } from './ssrf';
import { createMemoryCrawlStore, type CrawlStateData } from './state';

// ---- テスト用のローカル HTTP サーバー -------------------------------------------------

type Route = { status?: number; type?: string; body?: string; headers?: Record<string, string> };
let routes: Record<string, Route> = {};
let requests: { path: string; ua?: string; ifNoneMatch?: string }[] = [];
let server: http.Server;
let base: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    requests.push({ path: req.url ?? '', ua: req.headers['user-agent'], ifNoneMatch: req.headers['if-none-match'] as string | undefined });
    const route = routes[req.url ?? ''];
    if (!route) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    res.writeHead(route.status ?? 200, { 'content-type': route.type ?? 'text/html; charset=utf-8', ...route.headers });
    res.end(route.body ?? '');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));
beforeEach(() => {
  routes = {};
  requests = [];
});

/** テスト用サーバーにだけ接続を許可したフェッチャー（既定のフェッチャーはループバックを拒否する） */
const localFetcher = () => createNodeFetcher({ isAllowedAddress: (a) => a === '127.0.0.1' });

function fakeClock(start = Date.parse('2026-11-19T00:00:00Z')) {
  let t = start;
  const sleeps: number[] = [];
  return {
    now: () => new Date(t),
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
    advance: (ms: number) => {
      t += ms;
    },
    sleeps,
  };
}

const UA = 'bizshow-collector/0.1 (+http://localhost:3000/bot)';
const crawlConfig = { maxPages: 3, intervalSec: 10, recrawlDays: 30, userAgent: UA };
const emptyState = (): CrawlStateData => ({ pages: {}, suspendedHosts: {} });

function crawler(clock = fakeClock(), state = emptyState(), config: Partial<typeof crawlConfig> = {}, fetcher: Fetcher = localFetcher()) {
  const saved: string[] = [];
  const c = new Crawler({
    config: { ...crawlConfig, ...config },
    fetcher,
    state,
    saveRaw: async (url) => {
      saved.push(url);
    },
    now: clock.now,
    sleep: clock.sleep,
  });
  return { c, saved, state, clock };
}

const page = (body: string, lang = 'ja') => `<!doctype html><html lang="${lang}"><head><title>t</title></head><body>${body}</body></html>`;

// ---- 単体 --------------------------------------------------------------------------

describe('isPublicAddress (SSRF)', () => {
  it.each(['127.0.0.1', '10.0.0.1', '10.255.255.255', '169.254.169.254', '172.16.0.1', '192.168.1.1', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:a9fe:a9fe', '64:ff9b::a00:1', 'not-an-ip'])(
    'rejects %s',
    (a) => expect(isPublicAddress(a)).toBe(false),
  );
  it.each(['8.8.8.8', '203.0.112.1', '172.32.0.1', '2001:4860:4860::8888', '::ffff:8.8.8.8'])('allows %s', (a) => expect(isPublicAddress(a)).toBe(true));
});

describe('parseRobots', () => {
  const txt = `
User-agent: *
Disallow: /private/
Allow: /private/ok.html
Crawl-delay: 20

User-agent: other-bot
Disallow: /
`;
  it('applies Disallow / Allow (longest match) and Crawl-delay for the * group', () => {
    const r = parseRobots(txt, UA);
    expect(r.isAllowed('/')).toBe(true);
    expect(r.isAllowed('/private/a.html')).toBe(false);
    expect(r.isAllowed('/private/ok.html')).toBe(true);
    expect(r.crawlDelaySec).toBe(20);
  });
  it('prefers the group for our product token and supports wildcards', () => {
    const r = parseRobots('User-agent: *\nDisallow: /\n\nUser-agent: bizshow-collector\nDisallow: /*.pdf$\n', UA);
    expect(r.isAllowed('/about')).toBe(true);
    expect(r.isAllowed('/files/a.pdf')).toBe(false);
    expect(r.isAllowed('/files/a.pdf?x')).toBe(true);
  });
  it('treats an empty Disallow as allow-all', () => {
    expect(parseRobots('User-agent: *\nDisallow:\n', UA).isAllowed('/x')).toBe(true);
  });
});

describe('parsePage / selectFollowLinks', () => {
  const top = new URL('https://www.example.jp/');
  it('finds html lang, hreflang, path and language switch links including Tiếng Việt', () => {
    const html = `<html lang="ja"><head>
      <link rel="alternate" hreflang="en" href="https://www.example.jp/en/">
      <link rel="alternate" hreflang="zh-Hans" href="https://www.example.jp/zh/">
      <link rel="alternate" hreflang="x-default" href="https://www.example.jp/">
    </head><body>
      <a href="/vi/">Tiếng Việt</a> <a href="/company/">会社概要</a>
    </body></html>`;
    const { hints } = parsePage(html, top);
    expect(hints).toEqual(
      expect.arrayContaining([
        { lang: 'ja', signal: 'html_lang', url: top.toString() },
        { lang: 'en', signal: 'hreflang', url: top.toString() },
        { lang: 'zh', signal: 'hreflang', url: top.toString() },
        { lang: 'vi', signal: 'switch_link', url: 'https://www.example.jp/vi/' },
      ]),
    );
    expect(hints.some((h) => h.lang === 'vi' && h.signal === 'path')).toBe(false);
    expect(parsePage(page(''), new URL('https://www.example.jp/vi/about')).hints).toContainEqual({
      lang: 'vi',
      signal: 'path',
      url: 'https://www.example.jp/vi/about',
    });
  });
  it('detects Vietnamese body text and the "ベトナム語" / "Vietnamese" switch labels', () => {
    const vi = 'Chúng tôi hỗ trợ khách hàng bằng tiếng Việt. Vui lòng liên hệ với chúng tôi để được tư vấn miễn phí.';
    expect(parsePage(page(`<p>${vi}</p>`), top).hints).toContainEqual({ lang: 'vi', signal: 'body_text', url: top.toString() });
    expect(parsePage(page('<a href="/vn">ベトナム語</a>'), top).hints).toContainEqual(expect.objectContaining({ lang: 'vi', signal: 'switch_link' }));
    expect(parsePage(page('<a href="/v">Vietnamese</a>'), top).hints).toContainEqual(expect.objectContaining({ lang: 'vi', signal: 'switch_link' }));
  });
  it('follows only same-site info / language links without query, login or files', () => {
    const { links } = parsePage(
      page(`
      <a href="https://other.example.com/about">about other</a>
      <a href="/search?q=a">検索</a>
      <a href="/login">ログイン</a>
      <a href="/contact/">お問い合わせ</a>
      <a href="/access">アクセス</a>
      <a href="/brochure.pdf">会社概要 PDF</a>
      <a href="https://example.jp/en/">English</a>
      <a href="/news/">ニュース</a>
      <a href="javascript:alert(1)">x</a>`),
      top,
    );
    expect(selectFollowLinks(links, top, 2).map(String)).toEqual(['https://example.jp/en/', 'https://www.example.jp/contact/']);
    expect(selectFollowLinks(links, top, 0)).toEqual([]);
  });
});

// ---- 取得（ローカルのテスト用 HTTP サーバー） ---------------------------------------------

describe('createNodeFetcher (SSRF)', () => {
  it('rejects loopback, private and metadata addresses with the default policy', async () => {
    const fetcher = createNodeFetcher();
    for (const url of [`${base}/`, 'http://10.0.0.1/', 'http://169.254.169.254/latest/meta-data/', 'http://[::1]/', `http://localhost:${new URL(base).port}/`]) {
      const res = await fetcher({ url: new URL(url), userAgent: UA, accept: 'html' });
      expect(res).toMatchObject({ kind: 'rejected', reason: 'blocked address' });
    }
    expect(requests).toEqual([]);
  });
  it('rejects non-http(s) URLs, non-HTML and oversized bodies', async () => {
    const fetcher = createNodeFetcher({ isAllowedAddress: () => true, maxBodyBytes: 1000 });
    expect(await fetcher({ url: new URL('file:///etc/passwd'), userAgent: UA, accept: 'html' })).toMatchObject({ kind: 'rejected' });
    routes['/data.json'] = { type: 'application/json', body: '{}' };
    expect(await fetcher({ url: new URL(`${base}/data.json`), userAgent: UA, accept: 'html' })).toMatchObject({ kind: 'rejected', reason: 'not text/html' });
    routes['/big'] = { body: 'x'.repeat(5000) };
    expect(await fetcher({ url: new URL(`${base}/big`), userAgent: UA, accept: 'html' })).toMatchObject({ kind: 'rejected', reason: 'body too large' });
    routes['/big-chunked'] = { body: 'x'.repeat(5000), headers: { 'transfer-encoding': 'chunked' } };
    expect(await fetcher({ url: new URL(`${base}/big-chunked`), userAgent: UA, accept: 'html' })).toMatchObject({ kind: 'rejected', reason: 'body too large' });
  });
});

describe('Crawler (F-115)', () => {
  it('obeys robots.txt Disallow, Crawl-delay and the interval, sends the UA, and limits pages', async () => {
    routes['/robots.txt'] = { type: 'text/plain', body: 'User-agent: *\nDisallow: /secret/\nCrawl-delay: 15\n' };
    routes['/'] = {
      body: page(`<a href="/secret/company">会社概要（非公開）</a><a href="/en/">English</a><a href="/access/">アクセス</a><a href="/contact/">お問い合わせ</a>`),
    };
    routes['/en/'] = { body: page('<p>Welcome</p>', 'en') };
    routes['/access/'] = { body: page('<p>アクセス</p>') };
    routes['/contact/'] = { body: page('<p>contact</p>') };
    const { c, clock, saved } = crawler();
    const result = await c.crawlSite(new URL(`${base}/`));

    expect(result.status).toBe('crawled');
    const paths = requests.map((r) => r.path);
    expect(paths).not.toContain('/secret/company');
    // 最大 3 ページ（トップ＋2）。robots.txt を最初に取得
    expect(paths).toEqual(['/robots.txt', '/', '/en/', '/access/']);
    expect(result.pagesFetched).toBe(3);
    expect(requests.every((r) => r.ua === UA)).toBe(true);
    // 間隔は max(10 秒, Crawl-delay 15 秒)
    expect(clock.sleeps).toEqual([15000, 15000, 15000]);
    expect(result.hints).toEqual(expect.arrayContaining([expect.objectContaining({ lang: 'en' }), expect.objectContaining({ lang: 'ja' })]));
    expect(saved).toHaveLength(3);
  });

  it('uses COLLECTOR_CRAWL_INTERVAL_SEC when there is no Crawl-delay and treats robots.txt 4xx as allow-all', async () => {
    routes['/'] = { body: page('<a href="/about/">about</a>') };
    routes['/about/'] = { body: page('') };
    const { c, clock } = crawler(fakeClock(), emptyState(), { intervalSec: 12 });
    const result = await c.crawlSite(new URL(`${base}/`));
    expect(result.status).toBe('crawled');
    expect(requests.map((r) => r.path)).toEqual(['/robots.txt', '/', '/about/']);
    expect(clock.sleeps).toEqual([12000, 12000]);
  });

  it('aborts the site when robots.txt returns 5xx', async () => {
    routes['/robots.txt'] = { status: 500, type: 'text/plain', body: 'error' };
    routes['/'] = { body: page('') };
    const { c } = crawler();
    expect((await c.crawlSite(new URL(`${base}/`))).status).toBe('robots_unavailable');
    expect(requests.map((r) => r.path)).toEqual(['/robots.txt']);
  });

  it('suspends the host for 24 hours on 429', async () => {
    routes['/'] = { status: 429, body: 'slow down' };
    const { c, state, clock } = crawler();
    expect((await c.crawlSite(new URL(`${base}/`))).status).toBe('suspended');
    // robots.txt の後、間隔 10 秒を空けてトップページで 429
    expect(Object.values(state.suspendedHosts)).toEqual(['2026-11-20T00:00:10.000Z']);
    requests = [];
    expect((await c.crawlSite(new URL(`${base}/`))).status).toBe('suspended');
    expect(requests).toEqual([]);
    clock.advance(24 * 60 * 60 * 1000 + 1);
    expect(c.isSuspended(new URL(base).host)).toBe(false);
  });

  it('does not refetch within COLLECTOR_RECRAWL_DAYS and sends If-None-Match afterwards', async () => {
    routes['/'] = { body: page('<a href="/vi/">Tiếng Việt</a>'), headers: { etag: '"v1"' } };
    routes['/vi/'] = { body: page('', 'vi') };
    const clock = fakeClock();
    const state = emptyState();
    const first = await crawler(clock, state).c.crawlSite(new URL(`${base}/`));
    expect(first.hints).toContainEqual(expect.objectContaining({ lang: 'vi', signal: 'switch_link' }));

    requests = [];
    clock.advance(29 * 24 * 60 * 60 * 1000);
    const again = await crawler(clock, state).c.crawlSite(new URL(`${base}/`));
    expect(requests.map((r) => r.path)).toEqual(['/robots.txt']);
    expect(again.hints).toEqual(first.hints);

    requests = [];
    clock.advance(2 * 24 * 60 * 60 * 1000);
    routes['/'] = { status: 304 };
    const later = await crawler(clock, state).c.crawlSite(new URL(`${base}/`));
    expect(requests.find((r) => r.path === '/')?.ifNoneMatch).toBe('"v1"');
    expect(later.hints).toContainEqual(expect.objectContaining({ lang: 'vi' }));
  });

  it('follows same-site redirects up to 3 times and checks robots.txt on each hop', async () => {
    routes['/robots.txt'] = { type: 'text/plain', body: 'User-agent: *\nDisallow: /blocked\n' };
    routes['/'] = { status: 301, headers: { location: '/r1' } };
    routes['/r1'] = { status: 302, headers: { location: '/blocked' } };
    const { c } = crawler();
    expect((await c.crawlSite(new URL(`${base}/`))).status).toBe('failed');
    expect(requests.map((r) => r.path)).toEqual(['/robots.txt', '/', '/r1']);

    requests = [];
    routes['/robots.txt'] = { status: 404 };
    for (let i = 0; i < 5; i++) routes[i === 0 ? '/' : `/l${i}`] = { status: 302, headers: { location: `/l${i + 1}` } };
    const loop = await crawler().c.crawlSite(new URL(`${base}/`));
    expect(loop).toMatchObject({ status: 'failed', error: 'too many redirects' });
    expect(requests.map((r) => r.path)).toEqual(['/robots.txt', '/', '/l1', '/l2', '/l3']);
  });

  it('does not follow cross-site redirects', async () => {
    routes['/'] = { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } };
    const result = await crawler().c.crawlSite(new URL(`${base}/`));
    expect(result).toMatchObject({ status: 'failed', error: 'cross-site redirect' });
  });
});

// ---- 実行（候補への記録） ---------------------------------------------------------------

const source: DataSourceRecord = { id: 'test-source', kind: 'open_data', name: 'Test', url: 'https://example.com', isEnabled: true };

function candidate(id: string, websiteUrl: string | undefined, languageEvidence: LanguageEvidence[] = [], fetchedAt = new Date('2026-11-01T00:00:00Z')): CandidateInput {
  const extracted: CandidateExtract = {
    category: 'medical',
    prefecture: 'tokyo',
    supportedLanguages: [],
    name: { ja: `医療法人 ${id}` },
    websiteUrl,
  };
  return {
    sourceId: source.id,
    sourceRecordId: id,
    fetchedAt,
    extracted,
    languageEvidence,
    hasTargetLanguage: languageEvidence.some((e) => e.lang === 'vi'),
    entityType: 'corporation',
    entityEvidence: [],
    matchType: 'new',
    score: 55,
  };
}

async function setup(cands: CandidateInput[], blocklist: { domain: string | null; corporateNumber: string | null }[] = []) {
  const mem = createMemoryRepository([source], [], blocklist);
  for (const c of cands) await mem.repo.upsertCandidate(c);
  return mem;
}

describe('runCrawl (F-115)', () => {
  it('makes no network request when COLLECTOR_CRAWL_ENABLED=false', async () => {
    const mem = await setup([candidate('a', `${base}/`)]);
    const fetcher = vi.fn<Fetcher>();
    const createFetcher = vi.fn(() => fetcher);
    const { store } = createMemoryCrawlStore();
    const result = await runCrawl({ config: loadCollectorConfig({}), repo: mem.repo, createFetcher, store });
    expect(result.status).toBe('disabled');
    expect(createFetcher).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    expect(requests).toEqual([]);

    // CLI も無効時は DB・ネットワークに触れない
    const createRepo = vi.fn();
    const logs: string[] = [];
    expect(await crawlMain([], { env: {}, createRepo, createFetcher, log: (m) => logs.push(m) })).toBe(0);
    expect(createRepo).not.toHaveBeenCalled();
    expect(createFetcher).not.toHaveBeenCalled();
    expect(logs[0]).toMatch(/disabled/);
  });

  it('records website language evidence (Tiếng Việt) on the candidate and updates hasTargetLanguage / score', async () => {
    routes['/'] = { body: page('<a href="/vi/">Tiếng Việt</a><a href="/en/" hreflang="en">EN</a>') };
    routes['/vi/'] = { body: page('', 'vi') };
    routes['/en/'] = { body: page('', 'en') };
    const keep: LanguageEvidence = { lang: 'en', kind: 'open_data', value: '外国語対応: 英語' };
    const mem = await setup([candidate('a', `${base}/`, [keep])]);
    const clock = fakeClock();
    const { store, raw } = createMemoryCrawlStore();
    const config = loadCollectorConfig({ COLLECTOR_CRAWL_ENABLED: 'true' });
    const result = await runCrawl({ config, repo: mem.repo, createFetcher: localFetcher, store, now: clock.now, sleep: clock.sleep });

    expect(result).toMatchObject({ status: 'succeeded', siteCount: 1, crawledSiteCount: 1, updatedCandidateCount: 1, pagesFetched: 3 });
    const c = mem.candidates.get('test-source/a')!;
    expect(c.languageEvidence[0]).toEqual(keep);
    expect(c.languageEvidence).toContainEqual({ lang: 'vi', kind: 'website', value: `${base}/vi/`, signal: 'switch_link', checkedAt: clock.now().toISOString() });
    expect(c.languageEvidence).toContainEqual(expect.objectContaining({ lang: 'en', kind: 'website', signal: 'switch_link', value: `${base}/en/` }));
    expect(c.languageEvidence).toContainEqual(expect.objectContaining({ lang: 'vi', kind: 'website', signal: 'html_lang', value: `${base}/vi/` }));
    expect(c.hasTargetLanguage).toBe(true);
    // 言語の点: 対象言語以外の外国語 10 → 対象言語 20
    expect(c.score).toBe(65);
    // 生 HTML を保存し、掲載内容（extracted）は変えない
    expect(raw.size).toBe(3);
    expect(c.extracted.supportedLanguages).toEqual([]);
  });

  it('crawls at most COLLECTOR_CRAWL_MAX_SITES_PER_RUN sites, preferring candidates without target-language evidence', async () => {
    routes['/'] = { body: page('') };
    const other = 'http://other.invalid/';
    const mem = await setup([
      candidate('has-vi', other, [{ lang: 'vi', kind: 'open_data', value: 'x' }], new Date('2026-10-01T00:00:00Z')),
      candidate('no-vi', `${base}/`),
    ]);
    const clock = fakeClock();
    const { store } = createMemoryCrawlStore();
    const config = loadCollectorConfig({ COLLECTOR_CRAWL_ENABLED: 'true', COLLECTOR_CRAWL_MAX_SITES_PER_RUN: '1' });
    const fetcher = localFetcher();
    const seen: string[] = [];
    const result = await runCrawl({
      config,
      repo: mem.repo,
      createFetcher: () => async (req) => {
        seen.push(req.url.host);
        return fetcher(req);
      },
      store,
      now: clock.now,
      sleep: clock.sleep,
    });
    expect(result).toMatchObject({ siteCount: 2, crawledSiteCount: 1, skippedByLimitCount: 1 });
    expect(new Set(seen)).toEqual(new Set([new URL(base).host]));
  });

  it('skips blocklisted domains and suspended hosts, and purges old raw HTML', async () => {
    const mem = await setup([candidate('a', 'https://blocked.example.jp/'), candidate('b', `${base}/`)], [{ domain: 'example.jp', corporateNumber: null }]);
    const host = new URL(base).host;
    const { store, raw } = createMemoryCrawlStore({ pages: {}, suspendedHosts: { [host]: '2026-11-19T12:00:00.000Z' } });
    raw.set('crawl/html/old.html', { body: 'x', savedAt: new Date('2026-10-01T00:00:00Z') });
    const clock = fakeClock();
    const result = await runCrawl({
      config: loadCollectorConfig({ COLLECTOR_CRAWL_ENABLED: 'true' }),
      repo: mem.repo,
      createFetcher: localFetcher,
      store,
      now: clock.now,
      sleep: clock.sleep,
    });
    expect(result).toMatchObject({ skippedByBlocklistCount: 1, suspendedSiteCount: 1, crawledSiteCount: 0, purgedRawCount: 1 });
    expect(requests).toEqual([]);
  });

  it('does not recrawl candidates checked within COLLECTOR_RECRAWL_DAYS', async () => {
    const recent: LanguageEvidence = { lang: 'ja', kind: 'website', value: `${base}/`, signal: 'html_lang', checkedAt: '2026-11-10T00:00:00.000Z' };
    const mem = await setup([candidate('a', `${base}/`, [recent])]);
    const { store } = createMemoryCrawlStore();
    const clock = fakeClock();
    const result = await runCrawl({
      config: loadCollectorConfig({ COLLECTOR_CRAWL_ENABLED: 'true' }),
      repo: mem.repo,
      createFetcher: localFetcher,
      store,
      now: clock.now,
      sleep: clock.sleep,
    });
    expect(result.siteCount).toBe(0);
    expect(requests).toEqual([]);
  });
});

describe('runCrawl with LLM (F-117)', () => {
  const llmEnv = {
    COLLECTOR_CRAWL_ENABLED: 'true',
    COLLECTOR_LLM_ENABLED: 'true',
    COLLECTOR_LLM_MONTHLY_BUDGET_JPY: '100',
    COLLECTOR_LLM_MODEL: 'test-model',
    ANTHROPIC_API_KEY: 'dummy',
  };
  const companyPage = page('<p>さくらクリニック 東京都新宿区西新宿1-1-1 TEL 03-1234-5678</p>');

  function budgeted(text: string, usage: LlmUsageEntry[] = []) {
    const complete = vi.fn<LlmClient['complete']>().mockResolvedValue({ text, tokensIn: 1000, tokensOut: 100 });
    const { store, entries } = createMemoryLlmUsageStore(usage);
    const settings = { ...loadCollectorConfig(llmEnv).llm, model: 'test-model' };
    const llm = createBudgetedLlm({ client: { complete }, store, settings, now: () => new Date('2026-11-19T00:00:00Z') });
    return { llm, complete, entries };
  }

  it('does not call the LLM by default (crawl only)', async () => {
    const mem = await setup([candidate('a', 'https://site.invalid/')]);
    const createLlm = vi.fn();
    const logs: string[] = [];
    // robots.txt を拒否する（通信・待ち時間なし）
    const fetcher = vi.fn<Fetcher>().mockImplementation(async ({ url }) => ({ kind: 'rejected', reason: 'test', url }));
    const run = (env: Record<string, string>) =>
      crawlMain([], { env, createRepo: () => mem.repo, createFetcher: () => fetcher, store: createMemoryCrawlStore().store, createLlm, log: (m) => logs.push(m) });

    expect(await run({ COLLECTOR_CRAWL_ENABLED: 'true' })).toBe(0);
    expect(createLlm).not.toHaveBeenCalled();
    expect(JSON.parse(logs.at(-1)!).llm).toBeUndefined();
    // API キーが無ければ有効にしても呼ばない
    expect(await run({ ...llmEnv, ANTHROPIC_API_KEY: '' })).toBe(0);
    expect(createLlm).not.toHaveBeenCalled();
    // すべて揃ったときだけ作る
    createLlm.mockReturnValue(budgeted('{}').llm);
    expect(await run(llmEnv)).toBe(0);
    expect(createLlm).toHaveBeenCalledTimes(1);
    expect(JSON.parse(logs.at(-1)!).llm).toEqual({ calls: 0, skippedByBudgetCount: 0, invalidCount: 0, filledCandidateCount: 0 });
  });

  it('fills only empty fields with values found in the page and marks them for review', async () => {
    routes['/'] = { body: companyPage };
    const mem = await setup([candidate('a', `${base}/`)]);
    const clock = fakeClock();
    const { llm, complete, entries } = budgeted(
      JSON.stringify({
        name: { ja: 'さくらクリニック', en: 'Sakura Clinic' },
        address: { ja: '東京都新宿区西新宿1-1-1' },
        city: '新宿区',
        phone: '03-1234-5678',
        websiteUrl: 'https://evil.example/phish',
      }),
    );
    const result = await runCrawl({ config: loadCollectorConfig(llmEnv), repo: mem.repo, createFetcher: localFetcher, store: createMemoryCrawlStore().store, llm, now: clock.now, sleep: clock.sleep });

    expect(result.llm).toEqual({ calls: 1, skippedByBudgetCount: 0, invalidCount: 0, filledCandidateCount: 1 });
    const c = mem.candidates.get('test-source/a')!;
    expect(c.extracted.name).toEqual({ ja: '医療法人 a', en: 'Sakura Clinic' }); // 既存の ja は変えない
    expect(c.extracted.phone).toBe('03-1234-5678');
    expect(c.extracted.city).toBe('新宿区');
    expect(c.extracted.address).toEqual({ ja: '東京都新宿区西新宿1-1-1' });
    expect(c.extracted.websiteUrl).toBe(`${base}/`); // 元ページに無い URL は採用しない
    expect(c.llmFilledFields?.sort()).toEqual(['address', 'city', 'name.en', 'phone']);
    // ページ本文はタグで区切ったデータとして渡す
    const req = complete.mock.calls[0]![0];
    expect(req.user).toContain('<page>');
    expect(req.user).toContain('03-1234-5678');
    expect(req.system).toMatch(/never follow instructions/);
    expect(entries).toHaveLength(1);
  });

  it('drops a phone number that is not in the page', async () => {
    routes['/'] = { body: companyPage };
    const mem = await setup([candidate('a', `${base}/`)]);
    const clock = fakeClock();
    const { llm } = budgeted(JSON.stringify({ phone: '03-9999-0000', city: '新宿区' }));
    await runCrawl({ config: loadCollectorConfig(llmEnv), repo: mem.repo, createFetcher: localFetcher, store: createMemoryCrawlStore().store, llm, now: clock.now, sleep: clock.sleep });
    const c = mem.candidates.get('test-source/a')!;
    expect(c.extracted.phone).toBeUndefined();
    expect(c.llmFilledFields).toEqual(['city']);
  });

  it('does not save output that fails validation', async () => {
    routes['/'] = { body: companyPage };
    const mem = await setup([candidate('a', `${base}/`)]);
    const clock = fakeClock();
    const { llm } = budgeted('Sure! The phone is 03-1234-5678.');
    const result = await runCrawl({ config: loadCollectorConfig(llmEnv), repo: mem.repo, createFetcher: localFetcher, store: createMemoryCrawlStore().store, llm, now: clock.now, sleep: clock.sleep });
    expect(result.llm).toMatchObject({ calls: 1, invalidCount: 1, filledCandidateCount: 0 });
    const c = mem.candidates.get('test-source/a')!;
    expect(c.extracted.phone).toBeUndefined();
    expect(c.llmFilledFields).toBeUndefined();

    const { llm: badShape } = budgeted(JSON.stringify({ phone: 'call us!!', name: 'not-an-object' }));
    routes['/'] = { body: companyPage };
    const mem2 = await setup([candidate('b', `${base}/`)]);
    const r2 = await runCrawl({ config: loadCollectorConfig(llmEnv), repo: mem2.repo, createFetcher: localFetcher, store: createMemoryCrawlStore().store, llm: badShape, now: clock.now, sleep: clock.sleep });
    expect(r2.llm).toMatchObject({ invalidCount: 1, filledCandidateCount: 0 });
  });

  it('skips LLM calls once the monthly budget is reached and records no extra usage', async () => {
    routes['/'] = { body: companyPage };
    const mem = await setup([candidate('a', `${base}/`)]);
    const clock = fakeClock();
    const { llm, complete, entries } = budgeted('{}', [
      { month: '2026-11', purpose: 'extract', model: 'test-model', tokensIn: 0, tokensOut: 0, costJpy: 100 },
    ]);
    const result = await runCrawl({ config: loadCollectorConfig(llmEnv), repo: mem.repo, createFetcher: localFetcher, store: createMemoryCrawlStore().store, llm, now: clock.now, sleep: clock.sleep });
    expect(complete).not.toHaveBeenCalled();
    expect(result.llm).toEqual({ calls: 0, skippedByBudgetCount: 1, invalidCount: 0, filledCandidateCount: 0 });
    expect(entries).toHaveLength(1);
    expect(result.status).toBe('succeeded');
  });

  it('does not call the LLM when no field is missing', async () => {
    routes['/'] = { body: companyPage };
    const full = candidate('a', `${base}/`);
    full.extracted = { ...full.extracted, name: { ja: 'x', en: 'X' }, address: { ja: '東京都' }, city: '新宿区', phone: '03-1234-5678' };
    const mem = await setup([full]);
    const clock = fakeClock();
    const { llm, complete } = budgeted('{}');
    await runCrawl({ config: loadCollectorConfig(llmEnv), repo: mem.repo, createFetcher: localFetcher, store: createMemoryCrawlStore().store, llm, now: clock.now, sleep: clock.sleep });
    expect(complete).not.toHaveBeenCalled();
  });
});
