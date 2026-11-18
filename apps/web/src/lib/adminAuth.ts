import { createHash, randomBytes } from 'node:crypto';

/** ID トークンを保持する httpOnly cookie */
export const ADMIN_TOKEN_COOKIE = 'admin_id_token';
/** Hosted UI ログイン中の state / PKCE verifier（10 分） */
export const ADMIN_STATE_COOKIE = 'admin_oauth_state';
export const ADMIN_VERIFIER_COOKIE = 'admin_oauth_verifier';

export interface AdminAuthConfig {
  mode: 'dev' | 'cognito';
  /** https://<prefix>.auth.<region>.amazoncognito.com */
  cognitoDomain: string;
  clientId: string;
  /** Web の公開 URL（コールバック URL の組み立てに使う） */
  baseUrl: string;
}

export function getAdminAuthConfig(env: Record<string, string | undefined> = process.env): AdminAuthConfig {
  return {
    mode: env.AUTH_MODE === 'dev' ? 'dev' : 'cognito',
    cognitoDomain: (env.COGNITO_DOMAIN ?? '').replace(/\/$/, ''),
    clientId: env.COGNITO_CLIENT_ID ?? '',
    baseUrl: (env.WEB_BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  };
}

export const callbackUrl = (config: AdminAuthConfig) => `${config.baseUrl}/admin/auth/callback`;

/** cookie の共通属性。https 配信時のみ Secure */
export function cookieOptions(config: AdminAuthConfig, maxAge: number) {
  return {
    httpOnly: true,
    secure: config.baseUrl.startsWith('https://'),
    sameSite: 'lax' as const,
    path: '/admin',
    maxAge,
  };
}

const base64url = (buf: Buffer) => buf.toString('base64url');

/** PKCE（S256）の verifier / challenge と CSRF 対策の state を生成 */
export function createPkce() {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  const state = base64url(randomBytes(16));
  return { verifier, challenge, state };
}

export function buildAuthorizeUrl(config: AdminAuthConfig, pkce: { challenge: string; state: string }): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: callbackUrl(config),
    scope: 'openid email',
    state: pkce.state,
    code_challenge: pkce.challenge,
    code_challenge_method: 'S256',
  });
  return `${config.cognitoDomain}/oauth2/authorize?${params}`;
}

export function buildLogoutUrl(config: AdminAuthConfig): string {
  const params = new URLSearchParams({ client_id: config.clientId, logout_uri: `${config.baseUrl}/admin/login` });
  return `${config.cognitoDomain}/logout?${params}`;
}

/** 認可コードを ID トークンに交換する（パブリッククライアント + PKCE） */
export async function exchangeCode(
  config: AdminAuthConfig,
  code: string,
  verifier: string,
): Promise<{ idToken: string; expiresIn: number }> {
  const res = await fetch(`${config.cognitoDomain}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      code,
      redirect_uri: callbackUrl(config),
      code_verifier: verifier,
    }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  const body = (await res.json()) as { id_token: string; expires_in: number };
  return { idToken: body.id_token, expiresIn: body.expires_in };
}
