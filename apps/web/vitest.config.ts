import { defineConfig } from 'vitest/config';

// tsconfig は Next.js 向けに jsx: preserve のため、テストでは React 自動ランタイムで変換する
export default defineConfig({
  esbuild: { jsx: 'automatic' },
});
