import { createHash } from 'node:crypto';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildAuthorizeUrl, buildLogoutUrl, cookieOptions, createPkce, exchangeCode, getAdminAuthConfig } from './adminAuth';

const config = getAdminAuthConfig({
  COGNITO_DOMAIN: 'https://bizshow.auth.ap-northeast-1.amazoncognito.com/',
  COGNITO_CLIENT_ID: 'client-1',
  WEB_BASE_URL: 'https://example.com',
});

afterEach(() => vi.unstubAllGlobals());

describe('admin auth helpers', () => {
  it('defaults to cognito mode and only enables dev mode explicitly', () => {
    expect(getAdminAuthConfig({}).mode).toBe('cognito');
    expect(getAdminAuthConfig({ AUTH_MODE: 'dev' }).mode).toBe('dev');
  });

  it('creates an S256 PKCE challenge for the verifier', () => {
    const { verifier, challenge, state } = createPkce();
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
    expect(state.length).toBeGreaterThan(10);
  });

  it('builds the Hosted UI authorize URL', () => {
    const url = new URL(buildAuthorizeUrl(config, { challenge: 'c', state: 's' }));
    expect(url.origin + url.pathname).toBe('https://bizshow.auth.ap-northeast-1.amazoncognito.com/oauth2/authorize');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      response_type: 'code',
      client_id: 'client-1',
      redirect_uri: 'https://example.com/admin/auth/callback',
      state: 's',
      code_challenge: 'c',
      code_challenge_method: 'S256',
    });
  });

  it('builds the logout URL back to the login page', () => {
    expect(buildLogoutUrl(config)).toContain('logout_uri=https%3A%2F%2Fexample.com%2Fadmin%2Flogin');
  });

  it('uses httpOnly cookies, Secure only over https', () => {
    expect(cookieOptions(config, 60)).toMatchObject({ httpOnly: true, secure: true, path: '/admin' });
    expect(cookieOptions(getAdminAuthConfig({}), 60).secure).toBe(false);
  });

  it('exchanges the code with the PKCE verifier', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id_token: 't', expires_in: 3600 })));
    vi.stubGlobal('fetch', fetchMock);
    await expect(exchangeCode(config, 'code-1', 'ver-1')).resolves.toEqual({ idToken: 't', expiresIn: 3600 });
    const body = String(fetchMock.mock.calls[0][1].body);
    expect(body).toContain('code_verifier=ver-1');
    expect(body).toContain('grant_type=authorization_code');
  });
});
