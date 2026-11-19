import { CollectorConfigError, isLlmAvailable, loadCollectorConfig, type BudgetedLlm, type CollectorConfig } from '@fss/shared';
import type { CollectorRepository } from '../types';
import { createNodeFetcher, type Fetcher } from './fetcher';
import { runCrawl } from './run';
import { createFileCrawlStore, type CrawlStore } from './state';

export const CRAWL_USAGE = `Usage: pnpm --filter collector crawl

Crawls the official websites of pending listing candidates and records language evidence (kind=website).
Runs only when COLLECTOR_CRAWL_ENABLED=true. Respects robots.txt, COLLECTOR_CRAWL_INTERVAL_SEC / Crawl-delay,
COLLECTOR_CRAWL_MAX_SITES_PER_RUN, COLLECTOR_CRAWL_MAX_PAGES and COLLECTOR_RECRAWL_DAYS.
When COLLECTOR_LLM_ENABLED=true, COLLECTOR_LLM_MONTHLY_BUDGET_JPY > 0, COLLECTOR_LLM_MODEL and ANTHROPIC_API_KEY are set,
empty fields (phone / address / city / English name) of candidates are filled from the fetched pages by an LLM
within the monthly budget (filled fields are marked for review).`;

export interface CrawlMainDeps {
  env: Record<string, string | undefined>;
  /** 無効時は作らない（DB にも接続しない） */
  createRepo: () => CollectorRepository;
  createFetcher?: () => Fetcher;
  store?: CrawlStore;
  /** LLM（F-117）。COLLECTOR_LLM_* と ANTHROPIC_API_KEY が揃っているときだけ呼ばれる */
  createLlm?: (llm: CollectorConfig['llm'] & { model: string; apiKey: string }) => BudgetedLlm;
  log?: (message: string) => void;
}

/** crawl コマンドの本体。戻り値は終了コード */
export async function crawlMain(argv: readonly string[], deps: CrawlMainDeps): Promise<number> {
  const log = deps.log ?? console.log;
  if (argv.includes('--help') || argv.includes('-h')) {
    log(CRAWL_USAGE);
    return 0;
  }
  const config = loadCollectorConfig(deps.env);
  if (!config.crawl.enabled) {
    log('Crawling is disabled (COLLECTOR_CRAWL_ENABLED=false). Nothing was fetched.');
    return 0;
  }
  const repo = deps.createRepo();
  const llm = isLlmAvailable(config.llm) && deps.createLlm ? deps.createLlm(config.llm) : undefined;
  const result = await runCrawl({
    config,
    repo,
    llm,
    createFetcher: deps.createFetcher ?? (() => createNodeFetcher()),
    store: deps.store ?? createFileCrawlStore(config.raw.dir),
  });
  log(JSON.stringify(result));
  return 0;
}

if (require.main === module) {
  (async () => {
    const { PrismaClient } = await import('@prisma/client');
    const { createPrismaCollectorRepository, createPrismaLlmUsageStore } = await import('../prismaRepository');
    const { createAnthropicLlmClient, createBudgetedLlm } = await import('@fss/shared');
    let prisma: InstanceType<typeof PrismaClient> | undefined;
    try {
      process.exitCode = await crawlMain(process.argv.slice(2), {
        env: process.env,
        createRepo: () => {
          prisma = new PrismaClient();
          return createPrismaCollectorRepository(prisma);
        },
        createLlm: (settings) =>
          createBudgetedLlm({
            client: createAnthropicLlmClient({ apiKey: settings.apiKey, model: settings.model }),
            store: createPrismaLlmUsageStore(prisma!),
            settings,
          }),
      });
    } catch (err) {
      console.error(err instanceof CollectorConfigError ? err.message : err);
      process.exitCode = 1;
    } finally {
      await prisma?.$disconnect();
    }
  })();
}
