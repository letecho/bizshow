import type { NextConfig } from 'next';
import { securityHeaders } from './src/lib/securityHeaders';

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
