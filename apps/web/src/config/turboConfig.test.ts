import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// B-004: tsconfig は .next/types/** を含むため、next build が .next/types を作り直している最中に
// tsc が走ると TS6053 になる。web の typecheck は必ず build の後に実行する。
describe('apps/web/turbo.json', () => {
  it('web の typecheck が同じパッケージの build に依存している（並列実行しない）', () => {
    const config = JSON.parse(readFileSync(resolve(__dirname, '../../turbo.json'), 'utf8')) as {
      extends?: string[];
      tasks?: Record<string, { dependsOn?: string[] }>;
    };
    expect(config.extends).toEqual(['//']);
    expect(config.tasks?.typecheck?.dependsOn).toEqual(expect.arrayContaining(['^build', 'build']));
  });
});
