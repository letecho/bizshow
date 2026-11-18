import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // packages/shared は TS ソースのまま参照するためトランスパイル対象にする
  transpilePackages: ['@fss/shared'],
  // CIでは `pnpm lint` (ESLint flat config) を別ジョブで実行するためビルド時のLintは無効化
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
