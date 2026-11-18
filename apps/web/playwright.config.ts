import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

/**
 * E2E スモーク。API(4000) と Web(3000) を自動起動する（起動済みなら再利用）。
 * 前提: DATABASE_URL の DB に migrate + seed 済み。CI では事前に `pnpm turbo run build --filter=web --filter=api` を実行する。
 */
export default defineConfig({
  testDir: './e2e',
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // CI は本番ビルド（dist）を node で起動する。事前に `pnpm --filter api build` が必要
      command: isCI ? 'pnpm --filter api start' : 'pnpm --filter api dev',
      url: `${apiUrl}/health`,
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
    {
      command: isCI ? 'pnpm start' : 'pnpm dev',
      url: 'http://localhost:3000/en',
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
  ],
});
