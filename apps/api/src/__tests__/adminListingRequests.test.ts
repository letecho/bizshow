import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createInMemoryListingRequestRepository } from '../repositories/listingRequestRepository';
import { createInMemoryServiceRepository, type InMemoryServiceRecord } from '../repositories/inMemoryServiceRepository';
import { testApp } from './helpers/fixtures';

const application = {
  category: 'telecom',
  prefecture: 'fukuoka',
  supportedLanguages: ['ja', 'en', 'vi'],
  name: { en: 'Fukuoka SIM Shop', vi: 'Cửa hàng SIM Fukuoka' },
  description: { en: 'Prepaid SIM for new arrivals.' },
  contactName: 'Kato',
  contactEmail: 'kato@example.com',
};

async function setup() {
  const records: InMemoryServiceRecord[] = [];
  const requests = createInMemoryListingRequestRepository();
  const app = testApp([], {
    serviceRepository: createInMemoryServiceRepository(records),
    listingRequestRepository: requests,
  });
  const created = await request(app).post('/api/v1/listing-requests').send(application);
  return { app, records, requests, id: created.body.data.id as string };
}

describe('admin listing requests API', () => {
  it('lists requests filtered by status', async () => {
    const { app } = await setup();
    const pending = await request(app).get('/api/v1/admin/listing-requests?status=pending');
    expect(pending.body.meta.total).toBe(1);
    expect(pending.body.data[0]).toMatchObject({ status: 'pending', contactEmail: 'kato@example.com' });
    const rejected = await request(app).get('/api/v1/admin/listing-requests?status=rejected');
    expect(rejected.body.meta.total).toBe(0);
  });

  it('approving creates a ServiceListing from the request', async () => {
    const { app, records, id } = await setup();
    const res = await request(app)
      .post(`/api/v1/admin/listing-requests/${id}/approve`)
      .send({ slug: 'fukuoka-sim-shop', isPublished: true });
    expect(res.status).toBe(201);
    expect(res.body.data.request.status).toBe('approved');
    expect(res.body.data.service).toMatchObject({
      slug: 'fukuoka-sim-shop',
      category: 'telecom',
      name: { en: 'Fukuoka SIM Shop', vi: 'Cửa hàng SIM Fukuoka' },
      isPublished: true,
    });
    expect(records).toHaveLength(1);
    expect(records[0]).not.toHaveProperty('contactEmail');
    const search = await request(app).get('/api/v1/services?prefecture=fukuoka&category=telecom');
    expect(search.body.data.map((s: { slug: string }) => s.slug)).toEqual(['fukuoka-sim-shop']);
  });

  it('rejecting marks the request and creates nothing; processed requests return 409', async () => {
    const { app, records, id } = await setup();
    const res = await request(app).post(`/api/v1/admin/listing-requests/${id}/reject`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('rejected');
    expect(records).toHaveLength(0);
    const again = await request(app).post(`/api/v1/admin/listing-requests/${id}/approve`).send({ slug: 'x' });
    expect(again.status).toBe(409);
  });

  it('returns 404 for unknown requests and 400 without a valid slug', async () => {
    const { app, id } = await setup();
    expect((await request(app).post('/api/v1/admin/listing-requests/nope/reject')).status).toBe(404);
    expect((await request(app).post(`/api/v1/admin/listing-requests/${id}/approve`).send({})).status).toBe(400);
  });
});
