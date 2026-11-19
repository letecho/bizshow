import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createInMemoryBlocklistRepository } from '../repositories/blocklistRepository';
import { testApp } from './helpers/fixtures';

function setup() {
  const repo = createInMemoryBlocklistRepository();
  return { repo, app: testApp([], { blocklistRepository: repo }) };
}

describe('admin blocklist API (F-116)', () => {
  it('requires authentication', async () => {
    const app = testApp([], { auth: { mode: 'cognito', verify: () => Promise.reject(new Error('x')) } });
    expect((await request(app).get('/api/v1/admin/blocklist')).status).toBe(401);
    expect((await request(app).post('/api/v1/admin/blocklist').send({ domain: 'example.com', reason: 'optout' })).status).toBe(401);
  });

  it('adds a domain (normalized from a pasted URL) and lists it', async () => {
    const { app } = setup();
    const created = await request(app)
      .post('/api/v1/admin/blocklist')
      .send({ domain: ' https://WWW.Example.com/contact ', reason: 'optout', note: '2026-11-19 依頼' });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ domain: 'www.example.com', corporateNumber: null, reason: 'optout' });

    const list = await request(app).get('/api/v1/admin/blocklist');
    expect(list.status).toBe(200);
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data[0].id).toBe(created.body.data.id);
  });

  it('adds a corporate number without a domain', async () => {
    const { app } = setup();
    const res = await request(app).post('/api/v1/admin/blocklist').send({ corporateNumber: '1234567890123', reason: 'terms' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ domain: null, corporateNumber: '1234567890123' });
  });

  it.each([
    [{ reason: 'optout' }, 'neither domain nor corporate number'],
    [{ domain: 'not a domain', reason: 'optout' }, 'invalid domain'],
    [{ domain: 'localhost', reason: 'optout' }, 'single-label host'],
    [{ corporateNumber: '12345', reason: 'optout' }, 'invalid corporate number'],
    [{ domain: 'example.com', reason: 'other' }, 'unknown reason'],
    [{ domain: 'example.com', reason: 'optout', note: 'x'.repeat(501) }, 'note too long'],
  ])('rejects %j (%s) with 400', async (body, _case) => {
    const { app, repo } = setup();
    const res = await request(app).post('/api/v1/admin/blocklist').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(repo.entries).toHaveLength(0);
  });

  it('deletes an entry and returns 404 for an unknown id', async () => {
    const { app, repo } = setup();
    const created = await request(app).post('/api/v1/admin/blocklist').send({ domain: 'example.com', reason: 'robots' });
    expect((await request(app).delete(`/api/v1/admin/blocklist/${created.body.data.id}`)).status).toBe(204);
    expect(repo.entries).toHaveLength(0);
    const missing = await request(app).delete('/api/v1/admin/blocklist/nope');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
  });
});
