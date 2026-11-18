import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { testApp } from './helpers/fixtures';

const app = testApp();

describe('GET /health', () => {
  it('returns ok with cache mode', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.cacheMode).toBe('memory');
  });
});
