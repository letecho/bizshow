import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createAuthOptionsFromEnv, type IdTokenVerifier } from '../middleware/auth';
import { testApp } from './helpers/fixtures';

const verify: IdTokenVerifier = async (token) => {
  if (token === 'admin-token') return { sub: 'u1', email: 'admin@example.com', groups: ['admin'] };
  if (token === 'user-token') return { sub: 'u2', groups: [] };
  throw new Error('invalid token');
};
const app = testApp([], { auth: { mode: 'cognito', verify } });

describe('requireAdmin (GET /api/v1/admin/me)', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/v1/admin/me');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { code: 'UNAUTHORIZED', message: expect.any(String) } });
  });

  it('returns 401 for an invalid token', async () => {
    const res = await request(app).get('/api/v1/admin/me').set('Authorization', 'Bearer broken');
    expect(res.status).toBe(401);
  });

  it('returns 403 for a non-admin user', async () => {
    const res = await request(app).get('/api/v1/admin/me').set('Authorization', 'Bearer user-token');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('passes an admin and exposes the user', async () => {
    const res = await request(app).get('/api/v1/admin/me').set('Authorization', 'Bearer admin-token');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { sub: 'u1', email: 'admin@example.com' } });
  });

  it('passes with AUTH_MODE=dev without a token', async () => {
    const res = await request(testApp([], { auth: { mode: 'dev' } })).get('/api/v1/admin/me');
    expect(res.status).toBe(200);
    expect(res.body.data.sub).toBe('dev-admin');
  });
});

describe('createAuthOptionsFromEnv', () => {
  it('returns dev mode for AUTH_MODE=dev', async () => {
    await expect(createAuthOptionsFromEnv({ AUTH_MODE: 'dev' })).resolves.toEqual({ mode: 'dev' });
  });

  it('refuses AUTH_MODE=dev in production', async () => {
    await expect(createAuthOptionsFromEnv({ AUTH_MODE: 'dev', NODE_ENV: 'production' })).rejects.toThrow('production');
  });

  it('rejects all tokens when Cognito is not configured', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const options = await createAuthOptionsFromEnv({});
    expect(options.mode).toBe('cognito');
    const res = await request(testApp([], { auth: options }))
      .get('/api/v1/admin/me')
      .set('Authorization', 'Bearer anything');
    expect(res.status).toBe(401);
    warn.mockRestore();
  });

  it('builds a Cognito verifier when configured', async () => {
    const options = await createAuthOptionsFromEnv({
      COGNITO_USER_POOL_ID: 'ap-northeast-1_abcdefghi',
      COGNITO_CLIENT_ID: 'client',
    });
    expect(options.mode).toBe('cognito');
  });
});
