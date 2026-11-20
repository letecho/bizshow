import { describe, it, expect } from 'vitest';
import request from 'supertest';
import type { IdTokenVerifier } from '../middleware/auth';
import { testApp } from './helpers/fixtures';

/**
 * 管理 API の全ルートが認証必須であることを、ルート定義から列挙して検証する（品質管理票 Q-065）。
 * 新しい管理ルートを追加しても、このテストが自動で対象に含める。
 */

interface Layer {
  route?: { path: string; methods: Record<string, boolean> };
  name: string;
  regexp: RegExp;
  handle: { stack?: Layer[] };
}

/** Express 4 のマウントパス（固定文字列）を正規表現から復元する */
function mountPath(layer: Layer): string {
  const source = layer.regexp.source;
  if (source === '^\\/?(?=\\/|$)') return '';
  return source
    .replace(/^\^/, '')
    .replace('\\/?(?=\\/|$)', '')
    .replace(/\\\//g, '/');
}

function collectRoutes(stack: Layer[], prefix: string): { method: string; path: string }[] {
  return stack.flatMap((layer) => {
    if (layer.route) {
      const path = (prefix + layer.route.path).replace(/:[^/]+/g, 'test-id').replace(/\/$/, '') || '/';
      return Object.keys(layer.route.methods)
        .filter((m) => layer.route!.methods[m])
        .map((method) => ({ method, path }));
    }
    if (layer.name === 'router' && layer.handle.stack) {
      return collectRoutes(layer.handle.stack, prefix + mountPath(layer));
    }
    return [];
  });
}

const verify: IdTokenVerifier = async (token) => {
  if (token === 'user-token') return { sub: 'u2', groups: [] };
  throw new Error('invalid token');
};
const app = testApp([], { auth: { mode: 'cognito', verify } });
const appStack = (app as unknown as { _router: { stack: Layer[] } })._router.stack;
const adminRoutes = collectRoutes(appStack, '').filter((r) => r.path.startsWith('/api/v1/admin'));

describe('admin API routes require authentication (all routes)', () => {
  it('enumerates the admin routes from the router definitions', () => {
    // 列挙が壊れて 0 件で素通りしないよう、既知のルートが含まれることを確認する
    expect(adminRoutes).toEqual(
      expect.arrayContaining([
        { method: 'get', path: '/api/v1/admin/me' },
        { method: 'post', path: '/api/v1/admin/categories' },
        { method: 'get', path: '/api/v1/admin/services' },
        { method: 'post', path: '/api/v1/admin/services' },
        { method: 'put', path: '/api/v1/admin/services/test-id' },
        { method: 'patch', path: '/api/v1/admin/services/test-id/publish' },
        { method: 'delete', path: '/api/v1/admin/services/test-id' },
        { method: 'get', path: '/api/v1/admin/listing-requests' },
        { method: 'post', path: '/api/v1/admin/listing-requests/test-id/approve' },
        { method: 'post', path: '/api/v1/admin/uploads' },
        { method: 'get', path: '/api/v1/admin/blocklist' },
        { method: 'post', path: '/api/v1/admin/blocklist' },
        { method: 'delete', path: '/api/v1/admin/blocklist/test-id' },
        { method: 'get', path: '/api/v1/admin/candidates' },
        { method: 'get', path: '/api/v1/admin/candidates/test-id' },
        { method: 'post', path: '/api/v1/admin/candidates/test-id/approve' },
        { method: 'post', path: '/api/v1/admin/candidates/test-id/reject' },
        { method: 'post', path: '/api/v1/admin/candidates/test-id/hold' },
      ]),
    );
  });

  it.each(adminRoutes.map((r) => [r.method.toUpperCase(), r.path, r] as const))(
    '%s %s returns 401 without a token and 403 for a non-admin',
    async (_m, _p, route) => {
      const call = () => request(app)[route.method as 'get'](route.path).send({});
      const anonymous = await call();
      expect(anonymous.status).toBe(401);
      expect(anonymous.body.error.code).toBe('UNAUTHORIZED');
      const user = await call().set('Authorization', 'Bearer user-token');
      expect(user.status).toBe(403);
    },
  );
});
