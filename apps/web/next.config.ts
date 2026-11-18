import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import type { NextConfig } from 'next';
import { securityHeaders } from './src/lib/securityHeaders';

/**
 * ローカル開発用: リポジトリ直下の .env を読み込む（API・Prisma と同じ 1 ファイルで設定するため）。
 * 既に設定されている環境変数（CI・Docker）は上書きせず、NODE_ENV は Next.js に任せる
 */
function loadRootEnv() {
  const file = path.resolve(__dirname, '../../.env');
  if (!existsSync(file)) return;
  for (const [key, value] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) {
    if (key !== 'NODE_ENV' && process.env[key] === undefined) process.env[key] = value;
  }
}
loadRootEnv();

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // packages/shared は TS ソースのまま参照するためトランスパイル対象にする
  transpilePackages: ['@fss/shared'],
  // CIでは `pnpm lint` (ESLint flat config) を別ジョブで実行するためビルド時のLintは無効化
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders({
          apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
          isDev: process.env.NODE_ENV !== 'production',
          uploadOrigin: process.env.UPLOAD_ORIGIN || undefined,
        }),
      },
    ];
  },
};

export default nextConfig;
