import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { LanguageHint } from './html';

/** URL ごとの取得記録（再取得の間隔と条件付き取得、取得しなかったときの手がかりの再利用に使う） */
export interface PageRecord {
  /** ISO 8601 */
  fetchedAt: string;
  etag?: string;
  lastModified?: string;
  hints: LanguageHint[];
  /** トップページから選んだ追加取得先（トップページのみ） */
  follow?: string[];
}

export interface CrawlStateData {
  pages: Record<string, PageRecord>;
  /** host → 停止の期限（ISO 8601）。429 / 503 で 24 時間 */
  suspendedHosts: Record<string, string>;
}

/** クロールの状態と生 HTML の保存先（COLLECTOR_RAW_DIR）。S3 への保存は D-006 */
export interface CrawlStore {
  load(): Promise<CrawlStateData>;
  save(state: CrawlStateData): Promise<void>;
  /** 生 HTML を保存し、保存キーを返す */
  saveRaw(url: string, body: string, now: Date): Promise<string>;
  /** 保存日数を過ぎた生 HTML を削除し、削除したファイル数を返す */
  purgeRaw(now: Date, retentionDays: number): Promise<number>;
}

const emptyState = (): CrawlStateData => ({ pages: {}, suspendedHosts: {} });
const DAY_MS = 24 * 60 * 60 * 1000;

export function createFileCrawlStore(rawDir: string): CrawlStore {
  const root = path.resolve(rawDir, 'crawl');
  const stateFile = path.join(root, 'state.json');
  const htmlRoot = path.join(root, 'html');
  return {
    async load() {
      try {
        const data = JSON.parse(await readFile(stateFile, 'utf8')) as Partial<CrawlStateData>;
        return { pages: data.pages ?? {}, suspendedHosts: data.suspendedHosts ?? {} };
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return emptyState();
        throw err;
      }
    },
    async save(state) {
      await mkdir(root, { recursive: true });
      const tmp = `${stateFile}.tmp`;
      await writeFile(tmp, JSON.stringify(state), 'utf8');
      await rename(tmp, stateFile);
    },
    async saveRaw(url, body, now) {
      const day = now.toISOString().slice(0, 10);
      const name = `${createHash('sha256').update(url).digest('hex').slice(0, 32)}.html`;
      const dir = path.join(htmlRoot, day);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, name), body, 'utf8');
      return `crawl/html/${day}/${name}`;
    },
    async purgeRaw(now, retentionDays) {
      let removed = 0;
      let days: string[];
      try {
        days = await readdir(htmlRoot);
      } catch {
        return 0;
      }
      const cutoff = now.getTime() - retentionDays * DAY_MS;
      for (const day of days) {
        const t = Date.parse(`${day}T00:00:00Z`);
        // 日付のディレクトリだけを対象にし、その日の終わりが保存期限を過ぎたら消す
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(t) || t + DAY_MS > cutoff) continue;
        const dir = path.join(htmlRoot, day);
        removed += (await readdir(dir)).length;
        await rm(dir, { recursive: true, force: true });
      }
      return removed;
    },
  };
}

/** テスト用のメモリ上の保存先 */
export function createMemoryCrawlStore(initial: CrawlStateData = emptyState()) {
  let state: CrawlStateData = structuredClone(initial);
  const raw = new Map<string, { body: string; savedAt: Date }>();
  const store: CrawlStore = {
    async load() {
      return structuredClone(state);
    },
    async save(s) {
      state = structuredClone(s);
    },
    async saveRaw(url, body, now) {
      const key = `crawl/html/${now.toISOString().slice(0, 10)}/${createHash('sha256').update(url).digest('hex').slice(0, 32)}.html`;
      raw.set(key, { body, savedAt: now });
      return key;
    },
    async purgeRaw(now, retentionDays) {
      let removed = 0;
      for (const [key, v] of raw) {
        if (now.getTime() - v.savedAt.getTime() > retentionDays * DAY_MS) {
          raw.delete(key);
          removed += 1;
        }
      }
      return removed;
    },
  };
  return { store, raw, state: () => state };
}
