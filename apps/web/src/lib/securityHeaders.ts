export interface SecurityHeadersOptions {
  /** ブラウザから直接呼ぶ API のオリジン（NEXT_PUBLIC_API_URL） */
  apiUrl: string;
  /** next dev では HMR のため eval / websocket を許可する */
  isDev: boolean;
}

/** next.config の headers() で全ページに付与するセキュリティヘッダ */
export function securityHeaders({ apiUrl, isDev }: SecurityHeadersOptions): { key: string; value: string }[] {
  const apiOrigin = new URL(apiUrl).origin;
  const csp = [
    "default-src 'self'",
    // App Router はインラインスクリプトを出力するため 'unsafe-inline' が必要（nonce 化は将来課題）
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    `connect-src 'self' ${apiOrigin}${isDev ? ' ws:' : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

  return [
    { key: 'Content-Security-Policy', value: csp },
    { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ];
}
