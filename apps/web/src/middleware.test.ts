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
