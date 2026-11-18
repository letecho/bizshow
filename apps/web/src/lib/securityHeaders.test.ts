import { describe, it, expect } from 'vitest';
import { securityHeaders } from './securityHeaders';

const get = (headers: { key: string; value: string }[], key: string) => headers.find((h) => h.key === key)?.value;

describe('securityHeaders', () => {
  it('includes the main security headers', () => {
    const headers = securityHeaders({ apiUrl: 'https://api.example.com', isDev: false });
    for (const key of [
      'Content-Security-Policy',
      'Strict-Transport-Security',
      'X-Content-Type-Options',
      'X-Frame-Options',
      'Referrer-Policy',
      'Permissions-Policy',
    ]) {
      expect(get(headers, key)).toBeTruthy();
    }
  });

  it('allows the API origin in connect-src and forbids framing', () => {
    const csp = get(securityHeaders({ apiUrl: 'https://api.example.com/v1', isDev: false }), 'Content-Security-Policy')!;
    expect(csp).toContain("connect-src 'self' https://api.example.com;");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-eval');
  });

  it('relaxes script/connect only in dev', () => {
    const csp = get(securityHeaders({ apiUrl: 'http://localhost:4000', isDev: true }), 'Content-Security-Policy')!;
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain('ws:');
  });

  it('allows images from the API origin and PUTs to the upload origin', () => {
    const csp = get(
      securityHeaders({
        apiUrl: 'http://localhost:4000',
        isDev: false,
        uploadOrigin: 'https://bizshow-assets.s3.ap-northeast-1.amazonaws.com/listings',
      }),
      'Content-Security-Policy',
    )!;
    expect(csp).toContain("img-src 'self' data: https: http://localhost:4000;");
    expect(csp).toContain("connect-src 'self' http://localhost:4000 https://bizshow-assets.s3.ap-northeast-1.amazonaws.com;");
  });
});
