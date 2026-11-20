import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { appCache } from '@fss/shared';
import { createInMemoryCategoryRepository } from '../repositories/categoryRepository';
import { createInMemoryListingRequestRepository } from '../repositories/listingRequestRepository';
import { createInMemoryServiceRepository, type InMemoryServiceRecord } from '../repositories/inMemoryServiceRepository';
import { CATEGORY_CACHE_KEY } from '../routes/categories';
import { makeRecord, testApp } from './helpers/fixtures';

const listing = {
  slug: 'gyosei-office',
  categories: ['legal', 'work'],
  prefecture: 'tokyo',
  supportedLanguages: ['ja', 'en'],
  name: { en: 'Gyosei Office' },
  description: { en: 'Visa and work permits.' },
  isPublished: true,
};

const application = {
  categories: ['work', 'legal'],
  prefecture: 'osaka',
  supportedLanguages: ['ja', 'vi'],
  name: { en: 'Osaka Job Support' },
  description: { en: 'Job hunting support.' },
  contactName: 'Kato',
  contactEmail: 'kato@example.com',
};

function setup(records: InMemoryServiceRecord[] = []) {
  const categories = createInMemoryCategoryRepository();
  const requests = createInMemoryListingRequestRepository();
  const app = testApp([], {
    serviceRepository: createInMemoryServiceRepository(records),
    categoryRepository: categories,
    listingRequestRepository: requests,
  });
  return { app, categories, requests, records };
}

beforeEach(async () => {
  await appCache.del(CATEGORY_CACHE_KEY);
});

describe('GET /api/v1/categories (F-121)', () => {
  it('returns the 8 initial categories with ja/en/vi names in sort order', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/v1/categories');
    expect(res.status).toBe(200);
    expect(res.body.data.map((c: { code: string }) => c.code)).toEqual([
      'medical',
      'legal',
      'housing',
      'telecom',
      'finance',
      'education',
      'work',
      'daily',
    ]);
    expect(res.body.data[1]).toEqual({ code: 'legal', name: { ja: '法律・ビザ', en: 'Legal & Visa', vi: 'Pháp lý & Visa' } });
  });
});

describe('POST /api/v1/admin/categories (F-121)', () => {
  it('requires authentication', async () => {
    const app = testApp([], { auth: { mode: 'cognito', verify: () => Promise.reject(new Error('x')) } });
    const res = await request(app).post('/api/v1/admin/categories').send({ code: 'pets', name: { en: 'Pets' } });
    expect(res.status).toBe(401);
  });

  it('creates a category (appended last) and the public list shows it right away', async () => {
    const { app } = setup();
    await request(app).get('/api/v1/categories'); // キャッシュを作る
    const res = await request(app)
      .post('/api/v1/admin/categories')
      .send({ code: 'pets', name: { en: 'Pets', ja: 'ペット', vi: '' } });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ data: { code: 'pets', name: { en: 'Pets', ja: 'ペット' } } });
    const list = await request(app).get('/api/v1/categories');
    expect(list.body.data.at(-1)).toEqual({ code: 'pets', name: { en: 'Pets', ja: 'ペット' } });
  });

  it('returns 409 CONFLICT for an existing code', async () => {
    const { app } = setup();
    const res = await request(app).post('/api/v1/admin/categories').send({ code: 'legal', name: { en: 'Legal' } });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it.each([
    ['missing en name', { code: 'pets', name: { ja: 'ペット' } }],
    ['malformed code', { code: 'Pets & Animals', name: { en: 'Pets' } }],
    ['code over 50 chars', { code: 'a'.repeat(51), name: { en: 'Pets' } }],
    ['name over 50 chars', { code: 'pets', name: { en: 'a'.repeat(51) } }],
  ])('returns 400 for %s', async (_label, body) => {
    const { app } = setup();
    const res = await request(app).post('/api/v1/admin/categories').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('listings with multiple categories (F-121)', () => {
  it('saves 2 categories in order and the listing is found from either category', async () => {
    const { app, records } = setup();
    const res = await request(app).post('/api/v1/admin/services').send(listing);
    expect(res.status).toBe(201);
    expect(res.body.data.categories).toEqual(['legal', 'work']);
    expect(records[0].categories).toEqual(['legal', 'work']);
    for (const category of ['legal', 'work']) {
      const search = await request(app).get(`/api/v1/services?category=${category}&q=gyosei`);
      expect(search.body.data.map((s: { slug: string }) => s.slug)).toEqual(['gyosei-office']);
      expect(search.body.data[0].categories).toEqual(['legal', 'work']);
    }
    const detail = await request(app).get('/api/v1/services/gyosei-office');
    expect(detail.body.data.categories).toEqual(['legal', 'work']);
  });

  it('a category added by the admin can be used right away', async () => {
    const { app } = setup();
    await request(app).get('/api/v1/categories');
    await request(app).post('/api/v1/admin/categories').send({ code: 'pets', name: { en: 'Pets' } });
    const res = await request(app).post('/api/v1/admin/services').send({ ...listing, categories: ['pets', 'daily'] });
    expect(res.status).toBe(201);
    expect(res.body.data.categories).toEqual(['pets', 'daily']);
  });

  it.each([
    ['0 categories', []],
    ['6 categories', ['medical', 'legal', 'housing', 'telecom', 'finance', 'work']],
    ['an unknown code', ['legal', 'no-such-category']],
  ])('returns 400 when creating or updating with %s', async (_label, categories) => {
    const existing = makeRecord({ slug: 'existing', categories: ['legal'] });
    const { app, records } = setup([existing]);
    const created = await request(app).post('/api/v1/admin/services').send({ ...listing, categories });
    expect(created.status).toBe(400);
    expect(created.body.error.code).toBe('VALIDATION_ERROR');
    const updated = await request(app)
      .put(`/api/v1/admin/services/${existing.id}`)
      .send({ ...listing, slug: 'existing', categories });
    expect(updated.status).toBe(400);
    expect(records).toHaveLength(1);
    expect(records[0].categories).toEqual(['legal']);
  });

  it('removes duplicate codes and keeps the order (the first one is the main category)', async () => {
    const { app } = setup();
    const res = await request(app)
      .post('/api/v1/admin/services')
      .send({ ...listing, categories: ['work', 'legal', 'work'] });
    expect(res.body.data.categories).toEqual(['work', 'legal']);
  });
});

describe('listing requests with multiple categories (F-121)', () => {
  it('accepts multiple categories and approval carries them to the listing', async () => {
    const { app, records, requests } = setup();
    const created = await request(app).post('/api/v1/listing-requests').send(application);
    expect(created.status).toBe(201);
    expect(requests.records[0].categories).toEqual(['work', 'legal']);
    const approved = await request(app)
      .post(`/api/v1/admin/listing-requests/${created.body.data.id}/approve`)
      .send({ slug: 'osaka-job-support', isPublished: true });
    expect(approved.status).toBe(201);
    expect(approved.body.data.service.categories).toEqual(['work', 'legal']);
    expect(records[0].categories).toEqual(['work', 'legal']);
  });

  it('rejects unknown or too many categories with 400 and saves nothing', async () => {
    const { app, requests } = setup();
    const unknown = await request(app)
      .post('/api/v1/listing-requests')
      .send({ ...application, categories: ['work', 'unknown-category'] });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.code).toBe('VALIDATION_ERROR');
    const tooMany = await request(app)
      .post('/api/v1/listing-requests')
      .send({ ...application, categories: ['medical', 'legal', 'housing', 'telecom', 'finance', 'work'] });
    expect(tooMany.status).toBe(400);
    expect(requests.records).toHaveLength(0);
  });
});
