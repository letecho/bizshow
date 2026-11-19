import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

describe('middleware', () => {
  it('redirects / to the best Accept-Language match', () => {
    const res = middleware(new NextRequest('http://localhost:3000/', { headers: { 'accept-language': 'vi' } }));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3000/vi');
  });

  it('falls back to /en', () => {
    const res = middleware(new NextRequest('http://localhost:3000/', { headers: { 'accept-language': 'fr' } }));
    expect(res.headers.get('location')).toBe('http://localhost:3000/en');
  });
});

describe('middleware (zh removed, F-120)', () => {
  it('permanently redirects /zh pages to the same English page, keeping the query', () => {
    const top = middleware(new NextRequest('http://localhost:3000/zh'));
    expect(top.status).toBe(308);
    expect(top.headers.get('location')).toBe('http://localhost:3000/en');
    const detail = middleware(new NextRequest('http://localhost:3000/zh/services/tokyo-clinic?x=1'));
    expect(detail.status).toBe(308);
    expect(detail.headers.get('location')).toBe('http://localhost:3000/en/services/tokyo-clinic?x=1');
  });

  it('does not negotiate Chinese for /', () => {
    const res = middleware(new NextRequest('http://localhost:3000/', { headers: { 'accept-language': 'zh-CN,zh;q=0.9,vi;q=0.5' } }));
    expect(res.headers.get('location')).toBe('http://localhost:3000/vi');
  });
});

describe('middleware (admin)', () => {
  it('redirects /admin pages to the login page without the token cookie', () => {
    const res = middleware(new NextRequest('http://localhost:3000/admin/services'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3000/admin/login');
  });

  it('lets the login and auth routes through', () => {
    expect(middleware(new NextRequest('http://localhost:3000/admin/login')).headers.get('location')).toBeNull();
    expect(middleware(new NextRequest('http://localhost:3000/admin/auth/callback')).headers.get('location')).toBeNull();
  });

  it('lets requests with the token cookie through', () => {
    const req = new NextRequest('http://localhost:3000/admin', { headers: { cookie: 'admin_id_token=abc' } });
    expect(middleware(req).headers.get('location')).toBeNull();
  });
});
