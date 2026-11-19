import {
  hasTargetLanguageEvidence,
  isBlockedEntity,
  languageEvidenceScore,
  type BudgetedLlm,
  type CollectorConfig,
  type LanguageEvidence,
} from '@fss/shared';
import { extractWithLlm, fillMissingFields, missingFillableFields } from '../llm/extract';
import type { CollectorRepository, CrawlTarget } from '../types';
import { Crawler, type SiteCrawlStatus } from './crawler';
import type { Fetcher } from './fetcher';
import type { LanguageHint } from './html';
import type { CrawlStore } from './state';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CrawlRunResult {
  status: 'disabled' | 'succeeded';
  /** 対象（pending で websiteUrl があり、再取得の間隔を過ぎた候補）のサイト数 */
  siteCount: number;
  crawledSiteCount: number;
  /** COLLECTOR_CRAWL_MAX_SITES_PER_RUN を超えて次回に回したサイト数 */
  skippedByLimitCount: number;
  /** ブロックリスト（F-116）に当たり取得しなかったサイト数 */
  skippedByBlocklistCount: number;
  /** 429 / 503 で停止中のため取得しなかった・途中で止めたサイト数 */
  suspendedSiteCount: number;
  /** robots.txt の禁止・取得不可、拒否、エラーで取得できなかったサイト数 */
  failedSiteCount: number;
  pagesFetched: number;
  requests: number;
  updatedCandidateCount: number;
  purgedRawCount: number;
  /** LLM による空欄の補完（F-117）。LLM が無効なら undefined */
  llm?: {
    calls: number;
    /** 当月の予算に達して呼ばなかったサイト数 */
    skippedByBudgetCount: number;
    /** 出力が検証に通らず捨てたサイト数 */
    invalidCount: number;
    /** 空欄を補完した候補数 */
    filledCandidateCount: number;
  };
  errorSample?: string;
}

export interface RunCrawlOptions {
  config: CollectorConfig;
  repo: CollectorRepository;
  /** 呼ばれる前に COLLECTOR_CRAWL_ENABLED を確認するため、無効時は作られない */
  createFetcher: () => Fetcher;
  store: CrawlStore;
  /** LLM（F-117）。isLlmAvailable のときだけ渡す。渡さなければ LLM を呼ばない */
  llm?: BudgetedLlm;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

/** サイトの単位（www. の有無・パスは同一視） */
function siteKey(url: URL): string {
  return `${url.protocol}//${url.hostname.toLowerCase().replace(/^www\./, '')}${url.port ? `:${url.port}` : ''}`;
}

function lastWebsiteCheck(evidence: readonly LanguageEvidence[]): number | undefined {
  const times = evidence
    .filter((e) => e.kind === 'website' && e.checkedAt)
    .map((e) => Date.parse(e.checkedAt!))
    .filter((t) => !Number.isNaN(t));
  return times.length > 0 ? Math.max(...times) : undefined;
}

/** 公式サイトの手がかりを kind=website の根拠に置き換える（他の根拠は残す） */
export function mergeWebsiteEvidence(evidence: readonly LanguageEvidence[], hints: readonly LanguageHint[], checkedAt: Date): LanguageEvidence[] {
  const kept = evidence.filter((e) => e.kind !== 'website');
  const website: LanguageEvidence[] = hints.map((h) => ({
    lang: h.lang,
    kind: 'website',
    value: h.url,
    signal: h.signal,
    checkedAt: checkedAt.toISOString(),
  }));
  return [...kept, ...website];
}

/**
 * 掲載候補の公式サイトをクロールし、対応言語の根拠（kind=website）を候補に記録する。
 * COLLECTOR_CRAWL_ENABLED=false では何も取得しない。対象言語の根拠が無い候補を優先し、1 回の実行で
 * COLLECTOR_CRAWL_MAX_SITES_PER_RUN サイトまで。掲載（ServiceListing）や候補の掲載内容は変えない。
 */
export async function runCrawl({ config, repo, createFetcher, store, llm, now = () => new Date(), sleep }: RunCrawlOptions): Promise<CrawlRunResult> {
  const result: CrawlRunResult = {
    status: 'disabled',
    siteCount: 0,
    crawledSiteCount: 0,
    skippedByLimitCount: 0,
    skippedByBlocklistCount: 0,
    suspendedSiteCount: 0,
    failedSiteCount: 0,
    pagesFetched: 0,
    requests: 0,
    updatedCandidateCount: 0,
    purgedRawCount: 0,
  };
  if (!config.crawl.enabled) return result;
  result.status = 'succeeded';
  if (llm) result.llm = { calls: 0, skippedByBudgetCount: 0, invalidCount: 0, filledCandidateCount: 0 };
  let llmBudgetReached = false;

  const state = await store.load();
  result.purgedRawCount = await store.purgeRaw(now(), config.raw.retentionDays);
  const blocklist = await repo.loadBlocklist();
  const recrawlMs = config.crawl.recrawlDays * DAY_MS;

  // 対象: 再取得の間隔を過ぎた候補。対象言語の根拠が無い → サイト未確認 → 古い順
  const targets = (await repo.loadCrawlTargets())
    .filter((t) => {
      const last = lastWebsiteCheck(t.languageEvidence);
      return last === undefined || now().getTime() - last >= recrawlMs;
    })
    .sort(
      (a, b) =>
        Number(a.hasTargetLanguage) - Number(b.hasTargetLanguage) ||
        Number(lastWebsiteCheck(a.languageEvidence) !== undefined) - Number(lastWebsiteCheck(b.languageEvidence) !== undefined) ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    );

  const sites = new Map<string, { url: URL; candidates: CrawlTarget[] }>();
  for (const t of targets) {
    let url: URL;
    try {
      url = new URL(t.websiteUrl);
    } catch {
      continue;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
    const key = siteKey(url);
    const site = sites.get(key);
    if (site) site.candidates.push(t);
    else sites.set(key, { url, candidates: [t] });
  }
  result.siteCount = sites.size;

  const errors: string[] = [];
  const crawler = new Crawler({
    config: config.crawl,
    fetcher: createFetcher(),
    state,
    saveRaw: (url, body, at) => store.saveRaw(url, body, at),
    now,
    sleep,
  });
  const failed: SiteCrawlStatus[] = ['robots_unavailable', 'disallowed', 'failed'];
  let crawled = 0;
  for (const { url, candidates } of sites.values()) {
    if (isBlockedEntity(blocklist, { websiteUrl: url.toString() })) {
      result.skippedByBlocklistCount += 1;
      continue;
    }
    if (crawler.isSuspended(url.host)) {
      result.suspendedSiteCount += 1;
      continue;
    }
    if (crawled >= config.crawl.maxSitesPerRun) {
      result.skippedByLimitCount += 1;
      continue;
    }
    crawled += 1;
    const site = await crawler.crawlSite(url);
    // 取得記録だけで済んだ（通信しなかった）サイトは上限に数えない
    if (site.requests === 0) crawled -= 1;
    result.pagesFetched += site.pagesFetched;
    result.requests += site.requests;
    if (site.status === 'suspended') result.suspendedSiteCount += 1;
    else if (failed.includes(site.status)) {
      result.failedSiteCount += 1;
      // 候補の内容は残さず、ホストと理由だけ
      if (errors.length < 3) errors.push(`${url.host}: ${site.error ?? site.status}`);
    } else result.crawledSiteCount += 1;

    if (site.status === 'crawled') {
      const checkedAt = now();
      for (const c of candidates) {
        const languageEvidence = mergeWebsiteEvidence(c.languageEvidence, site.hints, checkedAt);
        const before = languageEvidenceScore(c.languageEvidence, config.targetLanguages);
        const after = languageEvidenceScore(languageEvidence, config.targetLanguages);
        const updated = await repo.updateCandidateLanguageEvidence(c.id, {
          languageEvidence,
          hasTargetLanguage: hasTargetLanguageEvidence(languageEvidence, config.targetLanguages),
          score: c.score === 0 ? 0 : Math.max(0, Math.min(100, c.score - before + after)),
        });
        if (updated) result.updatedCandidateCount += 1;
      }

      // LLM: 空欄のある候補があり、この実行で取得したページがあるときだけ 1 サイト 1 回呼ぶ（F-117）
      const needing = candidates.filter((c) => missingFillableFields(c.extracted).length > 0);
      if (llm && result.llm && needing.length > 0 && site.pages.length > 0) {
        if (llmBudgetReached) result.llm.skippedByBudgetCount += 1;
        else {
          const first = needing[0]!.extracted;
          const outcome = await extractWithLlm(llm, { pages: site.pages, base: first }).catch(() => {
            // API の障害などは候補を変えずに続ける（応答の内容はログに残さない）
            if (errors.length < 3) errors.push(`${url.host}: llm request failed`);
            return { status: 'invalid' as const };
          });
          if (outcome.status === 'skipped_budget') {
            llmBudgetReached = true;
            result.llm.skippedByBudgetCount += 1;
          } else {
            result.llm.calls += 1;
            if (outcome.status === 'invalid') result.llm.invalidCount += 1;
            else {
              for (const c of needing) {
                const { extracted, filled } = fillMissingFields(c.extracted, outcome.extract);
                if (filled.length === 0) continue;
                const llmFilledFields = [...new Set([...c.llmFilledFields, ...filled])];
                if (await repo.updateCandidateExtraction(c.id, { extracted, llmFilledFields })) result.llm.filledCandidateCount += 1;
              }
            }
          }
        }
      }
    }
    await store.save(state);
  }
  await store.save(state);
  if (errors.length > 0) result.errorSample = errors.join(' / ');
  return result;
}
