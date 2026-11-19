import { loadCollectorConfig, CollectorConfigError } from '@fss/shared';
import { runCollection } from './run';
import { sourceAdapters } from './sources';
import type { CollectorRepository, SourceAdapter } from './types';

export const USAGE = `Usage: pnpm --filter collector collect --source <DataSource.id> [--file <path>]

  --file <path>  read the source data from a local file (e.g. a downloaded ZIP) instead of downloading it

Collects listing candidates from one data source and records a CollectionRun.
Candidates are reviewed by an administrator before they become listings.
Settings are read from COLLECTOR_* environment variables (see .env.example).`;

export type CliArgs = { help: true } | { help: false; source: string; file?: string };

function option(argv: readonly string[], name: string): string | undefined {
  const inline = argv.find((a) => a.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const i = argv.indexOf(name);
  if (i < 0) return undefined;
  const value = argv[i + 1];
  if (!value || value.startsWith('-')) throw new Error(`${name} requires a value`);
  return value;
}

export function parseArgs(argv: readonly string[]): CliArgs {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  const source = option(argv, '--source');
  if (!source) throw new Error('--source <id> is required');
  const file = option(argv, '--file');
  return file ? { help: false, source, file } : { help: false, source };
}

export interface MainDeps {
  env: Record<string, string | undefined>;
  repo: CollectorRepository;
  adapters?: Record<string, SourceAdapter>;
  log?: (message: string) => void;
}

/** CLI の本体。戻り値は終了コード */
export async function main(argv: readonly string[], deps: MainDeps): Promise<number> {
  const log = deps.log ?? console.log;
  const adapters = deps.adapters ?? sourceAdapters;
  let args: CliArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    log(`${(err as Error).message}\n\n${USAGE}`);
    return 2;
  }
  if (args.help) {
    log(USAGE);
    return 0;
  }

  // 不正な設定は収集を始める前に止める
  const config = loadCollectorConfig(deps.env);
  const source = await deps.repo.findSource(args.source);
  if (!source) {
    log(`Unknown data source: ${args.source}`);
    return 1;
  }
  if (!source.isEnabled) {
    log(`Data source is disabled (DataSource.isEnabled=false): ${source.id}`);
    return 1;
  }
  const adapter = adapters[source.id];
  if (!adapter) {
    log(`No adapter registered for data source: ${source.id}`);
    return 1;
  }

  const result = await runCollection({ source, adapter, config, repo: deps.repo, options: { file: args.file } });
  log(JSON.stringify({ source: source.id, ...result }));
  return result.status === 'succeeded' ? 0 : 1;
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  // --help は DB に接続せずに表示する
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE);
    process.exit(0);
  }
  (async () => {
    const { PrismaClient } = await import('@prisma/client');
    const { createPrismaCollectorRepository } = await import('./prismaRepository');
    const prisma = new PrismaClient();
    try {
      process.exitCode = await main(argv, { env: process.env, repo: createPrismaCollectorRepository(prisma) });
    } catch (err) {
      console.error(err instanceof CollectorConfigError ? err.message : err);
      process.exitCode = 1;
    } finally {
      await prisma.$disconnect();
    }
  })();
}
