import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

// B-014: next が使う postcss が既知の脆弱性の修正版以上である（ルート package.json の pnpm.overrides）

/** "8.5.33" → [8, 5, 33] */
const parse = (v: string) => v.split('.').map((n) => Number.parseInt(n, 10));
const atLeast = (v: string, min: string) => {
  const [a, b] = [parse(v), parse(min)];
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
};

describe('依存バージョン', () => {
  it('next が解決する postcss は 8.5.23 以上', () => {
    const fromNext = createRequire(createRequire(import.meta.url).resolve('next/package.json'));
    const { version } = fromNext('postcss/package.json') as { version: string };
    expect(atLeast(version, '8.5.23')).toBe(true);
  });
});
