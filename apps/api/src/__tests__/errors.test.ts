import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { createApp } from '../app';
import { createInMemoryServiceRepository } from '../repositories/inMemoryServiceRepository';
import { testApp } from './helpers/fixtures';
import { HttpError, errorHandler, notFoundHandler } from '../middleware/errors';

function appWith(register: (app: express.Express) => void) {
  const app = express();
  register(app);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.WEB_ORIGIN;
});

describe('error handling', () => {
  it('returns 404 JSON for unknown routes', async () => {
    const res = await request(testApp()).get('/no-such-path');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found: GET /no-such-path' } });
  });

  it('returns 500 INTERNAL_ERROR without leaking the stack', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = appWith((a) =>
      a.get('/boom', () => {
        throw new Error('secret internal detail');
      }),
    );
    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    expect(res.text).not.toContain('secret internal detail');
    expect(res.text).not.toContain('at ');
  });

  it('maps ZodError to 400 VALIDATION_ERROR', async () => {
    const app = appWith((a) =>
      a.get('/validate', (req) => {
        z.object({ limit: z.coerce.number().max(50) }).parse(req.query);
      }),
    );
    const res = await request(app).get('/validate?limit=100');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toContain('limit');
  });

  it('maps HttpError to its status and code', async () => {
    const app = appWith((a) =>
      a.get('/forbidden', () => {
        throw new HttpError(403, 'FORBIDDEN', 'nope');
      }),
    );
    const res = await request(app).get('/forbidden');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: { code: 'FORBIDDEN', message: 'nope' } });
  });
});

describe('CORS', () => {
  it('allows any origin when WEB_ORIGIN is unset', async () => {
    const res = await request(testApp()).get('/health').set('Origin', 'https://example.com');
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });

  it('uses WEB_ORIGIN when set', async () => {
    process.env.WEB_ORIGIN = 'https://web.example.com';
    const res = await request(testApp()).get('/health').set('Origin', 'https://web.example.com');
    expect(res.headers['access-control-allow-origin']).toBe('https://web.example.com');
  });
});

describe('access log', () => {
  it('writes one JSON line per request and skips /health', async () => {
    const lines: string[] = [];
    const app = createApp({ serviceRepository: createInMemoryServiceRepository([]), log: (l) => lines.push(l) });
    await request(app).get('/health');
    await request(app).get('/no-such-path?x=1');
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry).toMatchObject({ method: 'GET', path: '/no-such-path', status: 404 });
    expect(typeof entry.ms).toBe('number');
  });
});
