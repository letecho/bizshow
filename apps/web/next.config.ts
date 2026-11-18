import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // CIでは `pnpm lint` (ESLint flat config) を別ジョブで実行するためビルド時のLintは無効化
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
