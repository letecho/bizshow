import { defineConfig } from 'tsup';

/**
 * 本番ビルド: `node dist/main.js` で起動できる単一バンドルを作る。
 * - @fss/shared は TS ソースのまま公開されているためバンドルに取り込む（devDependencies 扱い）
 * - dependencies（@prisma/client, express 等）は external のまま。実行時は `pnpm deploy --prod` で用意する
 */
export default defineConfig({
  entry: ['src/main.ts'],
  format: ['cjs'],
  platform: 'node',
  target: 'node22',
  noExternal: ['@fss/shared'],
  clean: true,
  sourcemap: true,
});
