import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../main';

describe('GET /health', () => {
  it('returns ok with cache mode', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.cacheMode).toBe('memory');
  });
});

describe('GET /api/services', () => {
  it('filters by category', async () => {
    const res = await request(app).get('/api/services?category=legal&lang=en');
    expect(res.status).toBe(200);
    expect(res.body.items.every((i: { category: string }) => i.category === 'legal')).toBe(true);
  });
});
