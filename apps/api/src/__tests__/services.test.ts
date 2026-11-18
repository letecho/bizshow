import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { createInMemoryServiceRepository } from '../repositories/inMemoryServiceRepository';
import { makeRecord, testApp } from './helpers/fixtures';

// 検索結果は appCache（プロセス内 LRU）に 60 秒キャッシュされるため、
// テストごとに異なるクエリを使う
const records = [
  makeRecord({ slug: 'legal-tokyo', category: 'legal', prefecture: 'tokyo', supportedLanguages: ['ja', 'en', 'vi'] }),
  makeRecord({ slug: 'legal-osaka', category: 'legal', prefecture: 'osaka', supportedLanguages: ['ja', 'en'] }),
  makeRecord({
    slug: 'medical-tokyo',
    category: 'medical',
    prefecture: 'tokyo',
    supportedLanguages: ['ja', 'en', 'zh', 'vi'],
    name: { en: 'Shinjuku Clinic', ja: '新宿クリニック' },
  }),
  makeRecord({ slug: 'housing-hidden', category: 'housing', isPublished: false, supportedLanguages: ['vi'] }),
];
const app = testApp(records);

describe('GET /api/v1/services', () => {
  it('returns published services, newest first, with meta', async () => {
    const res = await request(app).get('/api/v1/services');
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 3 });
    expect(res.body.data.map((s: { slug: string }) => s.slug)).toEqual(['medical-tokyo', 'legal-osaka', 'legal-tokyo']);
    expect(res.body.data[0]).toEqual({
      id: records[2].id,
      slug: 'medical-tokyo',
      category: 'medical',
      prefecture: 'tokyo',
      city: null,
      supportedLanguages: ['ja', 'en', 'zh', 'vi'],
      name: { en: 'Shinjuku Clinic', ja: '新宿クリニック' },
    });
  });

  it('category=legal returns only legal services', async () => {
    const res = await request(app).get('/api/v1/services?category=legal');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.every((s: { category: string }) => s.category === 'legal')).toBe(true);
  });

  it('lang=vi returns only vi-supported published services', async () => {
    const res = await request(app).get('/api/v1/services?lang=vi');
    expect(res.status).toBe(200);
    expect(res.body.data.map((s: { slug: string }) => s.slug).sort()).toEqual(['legal-tokyo', 'medical-tokyo']);
  });

  it('filters by prefecture and keyword (case-insensitive)', async () => {
    const res = await request(app).get('/api/v1/services?prefecture=tokyo&q=SHINJUKU');
    expect(res.body.data.map((s: { slug: string }) => s.slug)).toEqual(['medical-tokyo']);
  });

  it('paginates', async () => {
    const res = await request(app).get('/api/v1/services?page=2&limit=2');
    expect(res.body.meta).toEqual({ page: 2, limit: 2, total: 3 });
    expect(res.body.data.map((s: { slug: string }) => s.slug)).toEqual(['legal-tokyo']);
  });

  it('limit=100 returns 400 VALIDATION_ERROR', async () => {
    const res = await request(app).get('/api/v1/services?limit=100');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('caches results for identical (normalized) queries', async () => {
    const repo = createInMemoryServiceRepository([makeRecord({ category: 'telecom', prefecture: 'aichi' })]);
    const search = vi.spyOn(repo, 'search');
    const cachedApp = createApp({ serviceRepository: repo });
    const first = await request(cachedApp).get('/api/v1/services?category=telecom&prefecture=aichi');
    const second = await request(cachedApp).get('/api/v1/services?prefecture=aichi&category=telecom&q=');
    expect(second.body).toEqual(first.body);
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('removes the legacy /api/services sample endpoint', async () => {
    const res = await request(app).get('/api/services');
    expect(res.status).toBe(404);
  });
});
