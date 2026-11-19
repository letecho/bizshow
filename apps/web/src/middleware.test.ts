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
