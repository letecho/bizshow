import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createInMemoryListingRequestRepository } from '../repositories/listingRequestRepository';
import { testApp } from './helpers/fixtures';

const valid = {
  categories: ['housing'],
  prefecture: 'osaka',
  city: 'Osaka',
  supportedLanguages: ['ja', 'en', 'vi'],
  name: { en: 'Osaka Housing Support', ja: '大阪住まいサポート' },
  description: { en: 'Apartment search for foreign residents.' },
  phone: '06-1234-5678',
  websiteUrl: 'https://example.com',
  contactName: 'Sato',
  contactEmail: 'sato@example.com',
};

function setup() {
  const repo = createInMemoryListingRequestRepository();
  return { repo, app: testApp([], { listingRequestRepository: repo }) };
}

describe('POST /api/v1/listing-requests', () => {
  it('saves the request as pending and returns 201', async () => {
    const { app, repo } = setup();
    const res = await request(app).post('/api/v1/listing-requests').send(valid);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ data: { id: repo.records[0].id, status: 'pending' } });
    expect(repo.records).toHaveLength(1);
    expect(repo.records[0]).toMatchObject({ status: 'pending', contactEmail: 'sato@example.com', categories: ['housing'] });
  });

  it.each(['name', 'categories', 'contactName', 'contactEmail', 'supportedLanguages'])(
    'returns 400 VALIDATION_ERROR when %s is missing',
    async (field) => {
      const { app, repo } = setup();
      const body: Record<string, unknown> = { ...valid };
      delete body[field];
      const res = await request(app).post('/api/v1/listing-requests').send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(repo.records).toHaveLength(0);
    },
  );

  it('ignores unknown fields such as status', async () => {
    const { app, repo } = setup();
    const res = await request(app)
      .post('/api/v1/listing-requests')
      .send({ ...valid, status: 'approved', isPublished: true });
    expect(res.status).toBe(201);
    expect(repo.records[0].status).toBe('pending');
    expect(repo.records[0]).not.toHaveProperty('isPublished');
  });
});
