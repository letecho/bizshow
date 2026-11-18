import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { parseTrustProxy } from '../middleware/rateLimit';
import { testApp } from './helpers/fixtures';

describe('global rate limit', () => {
  it('returns 429 with the error format once the limit is exceeded', async () => {
    const app = testApp([], { rateLimit: { limit: 3 } });
    for (let i = 0; i < 3; i++) {
      expect((await request(app).get('/api/v1/services')).status).toBe(200);
    }
    const res = await request(app).get('/api/v1/services');
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(res.headers['ratelimit-policy']).toBeDefined();
  });

  it('defaults to 120 requests per minute', async () => {
    const app = testApp();
    const res = await request(app).get('/api/v1/services');
    expect(res.headers['ratelimit-policy']).toBe('120;w=60');
  });

  it('does not limit /health', async () => {
    const app = testApp([], { rateLimit: { limit: 1 } });
    for (let i = 0; i < 3; i++) {
      expect((await request(app).get('/health')).status).toBe(200);
    }
  });

  it('counts per client IP from X-Forwarded-For when the proxy is trusted', async () => {
    const app = testApp([], { rateLimit: { limit: 1 }, trustProxy: 1 });
    const a = () => request(app).get('/api/v1/services').set('X-Forwarded-For', '203.0.113.1');
    const b = () => request(app).get('/api/v1/services').set('X-Forwarded-For', '203.0.113.2');
    expect((await a()).status).toBe(200);
    expect((await a()).status).toBe(429);
    expect((await b()).status).toBe(200);
  });

  it('ignores X-Forwarded-For when the proxy is not trusted', async () => {
    const app = testApp([], { rateLimit: { limit: 1 }, trustProxy: false });
    expect((await request(app).get('/api/v1/services').set('X-Forwarded-For', '203.0.113.1')).status).toBe(200);
    expect((await request(app).get('/api/v1/services').set('X-Forwarded-For', '203.0.113.2')).status).toBe(429);
  });
});

describe('security headers', () => {
  it('sets the main security headers and a strict CSP', async () => {
    const res = await request(testApp()).get('/health');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('parseTrustProxy', () => {
  it('parses env values', () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy('false')).toBe(false);
    expect(parseTrustProxy('true')).toBe(true);
    expect(parseTrustProxy('2')).toBe(2);
    expect(parseTrustProxy('loopback, 10.0.0.0/8')).toBe('loopback, 10.0.0.0/8');
  });
});
