import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createInMemoryServiceRepository } from '../repositories/inMemoryServiceRepository';
import { makeRecord, testApp } from './helpers/fixtures';

const input = {
  slug: 'kawasaki-legal',
  categories: ['legal'],
  prefecture: 'kanagawa',
  supportedLanguages: ['ja', 'en', 'vi'],
  name: { en: 'Kawasaki Legal Desk', vi: 'Tư vấn pháp lý Kawasaki' },
  description: { en: 'Visa and residence consultation.' },
};

function setup() {
  const records = [
    makeRecord({ slug: 'published-one', categories: ['daily'] }),
    makeRecord({ slug: 'hidden-one', categories: ['daily'], isPublished: false }),
  ];
  const repo = createInMemoryServiceRepository(records);
  return { records, app: testApp([], { serviceRepository: repo }) };
}

describe('admin services API', () => {
  it('requires authentication', async () => {
    const app = testApp([], { auth: { mode: 'cognito', verify: () => Promise.reject(new Error('x')) } });
    expect((await request(app).get('/api/v1/admin/services')).status).toBe(401);
    expect((await request(app).post('/api/v1/admin/services').send(input)).status).toBe(401);
  });

  it('lists all services including unpublished, with a published filter', async () => {
    const { app } = setup();
    const all = await request(app).get('/api/v1/admin/services');
    expect(all.body.meta.total).toBe(2);
    expect(all.body.data[0]).toHaveProperty('isPublished');
    const hidden = await request(app).get('/api/v1/admin/services?published=false');
    expect(hidden.body.data.map((s: { slug: string }) => s.slug)).toEqual(['hidden-one']);
  });

  it('filters collected listings not verified within COLLECTOR_STALE_DAYS with stale=true (F-116)', async () => {
    const sources = [{ attribution: 'Source', url: null }];
    const day = 24 * 60 * 60 * 1000;
    const ago = (days: number) => new Date(Date.now() - days * day).toISOString();
    const records = [
      makeRecord({ slug: 'manual-old' }),
      makeRecord({ slug: 'collected-never', sources }),
      makeRecord({ slug: 'collected-old', sources, lastVerifiedAt: ago(31) }),
      makeRecord({ slug: 'collected-fresh', sources, lastVerifiedAt: ago(29) }),
    ];
    const app = testApp([], { serviceRepository: createInMemoryServiceRepository(records), staleDays: 30 });
    const stale = await request(app).get('/api/v1/admin/services?stale=true');
    expect(stale.status).toBe(200);
    expect(stale.body.data.map((s: { slug: string }) => s.slug).sort()).toEqual(['collected-never', 'collected-old']);
    expect(stale.body.meta.total).toBe(2);
    expect((await request(app).get('/api/v1/admin/services')).body.meta.total).toBe(4);
  });

  it('keeps sources and lastVerifiedAt when an admin edits the listing', async () => {
    const records = [makeRecord({ slug: 'collected', sources: [{ attribution: 'Source', url: null }], lastVerifiedAt: '2026-11-01T00:00:00.000Z' })];
    const app = testApp([], { serviceRepository: createInMemoryServiceRepository(records) });
    const res = await request(app).put(`/api/v1/admin/services/${records[0].id}`).send({ ...input, slug: 'collected' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ sources: [{ attribution: 'Source', url: null }], lastVerifiedAt: '2026-11-01T00:00:00.000Z' });
  });

  it('create → publish makes the service appear in the public search API', async () => {
    const { app } = setup();
    // 公開前の検索結果をキャッシュさせる
    const before = await request(app).get('/api/v1/services?category=legal&prefecture=kanagawa');
    expect(before.body.meta.total).toBe(0);

    const created = await request(app).post('/api/v1/admin/services').send(input);
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ slug: 'kawasaki-legal', isPublished: false });

    const stillHidden = await request(app).get('/api/v1/services?category=legal&prefecture=kanagawa');
    expect(stillHidden.body.meta.total).toBe(0);

    const published = await request(app)
      .patch(`/api/v1/admin/services/${created.body.data.id}/publish`)
      .send({ isPublished: true });
    expect(published.status).toBe(200);

    const after = await request(app).get('/api/v1/services?category=legal&prefecture=kanagawa');
    expect(after.body.data.map((s: { slug: string }) => s.slug)).toEqual(['kawasaki-legal']);
    expect((await request(app).get('/api/v1/services/kawasaki-legal')).status).toBe(200);
  });

  it('updates a service and invalidates the cached detail', async () => {
    const { app, records } = setup();
    const id = records[0].id;
    expect((await request(app).get('/api/v1/services/published-one')).status).toBe(200);
    const res = await request(app)
      .put(`/api/v1/admin/services/${id}`)
      .send({ ...input, slug: 'renamed-one', isPublished: true });
    expect(res.status).toBe(200);
    expect((await request(app).get('/api/v1/services/published-one')).status).toBe(404);
    const detail = await request(app).get('/api/v1/services/renamed-one');
    expect(detail.body.data.name.en).toBe('Kawasaki Legal Desk');
  });

  it('unpublish and delete remove the service from the public API', async () => {
    const { app, records } = setup();
    const id = records[0].id;
    expect((await request(app).get('/api/v1/services/published-one')).status).toBe(200);
    await request(app).patch(`/api/v1/admin/services/${id}/publish`).send({ isPublished: false });
    expect((await request(app).get('/api/v1/services/published-one')).status).toBe(404);
    expect((await request(app).delete(`/api/v1/admin/services/${id}`)).status).toBe(204);
    expect((await request(app).get(`/api/v1/admin/services/${id}`)).status).toBe(404);
  });

  it('returns 409 for a duplicate slug, 400 for invalid input and 404 for unknown ids', async () => {
    const { app } = setup();
    const dup = await request(app)
      .post('/api/v1/admin/services')
      .send({ ...input, slug: 'hidden-one' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('CONFLICT');
    const invalid = await request(app)
      .post('/api/v1/admin/services')
      .send({ ...input, slug: 'Bad Slug', name: { ja: 'のみ' } });
    expect(invalid.status).toBe(400);
    expect((await request(app).put('/api/v1/admin/services/nope').send(input)).status).toBe(404);
    expect((await request(app).patch('/api/v1/admin/services/nope/publish').send({ isPublished: true })).status).toBe(404);
  });
});
