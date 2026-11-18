import type { RequestHandler, Response } from 'express';
import { HttpError } from './errors';

export interface AdminUser {
  sub: string;
  email?: string;
}

/** 検証済み ID トークンの中身（必要な項目のみ） */
export interface VerifiedIdToken {
  sub: string;
  email?: string;
  groups: string[];
}

/** ID トークンを検証する。不正・期限切れは例外を投げる */
export type IdTokenVerifier = (token: string) => Promise<VerifiedIdToken>;

export const ADMIN_GROUP = 'admin';

/** AUTH_MODE=dev で使う固定の管理者（ローカル開発専用） */
export const DEV_ADMIN: AdminUser = { sub: 'dev-admin', email: 'admin@localhost' };

/** requireAdmin 通過後のハンドラで管理者を取り出す */
export function getAdmin(res: Response): AdminUser {
  return res.locals.admin as AdminUser;
}

export type AuthOptions = { mode: 'dev' } | { mode: 'cognito'; verify: IdTokenVerifier };

/**
 * 管理 API 用。`Authorization: Bearer <Cognito ID トークン>` を検証し、admin グループのみ通す。
 * トークンなし・不正 = 401、admin 以外 = 403。検証済みユーザーは res.locals.admin
 */
export function requireAdmin(options: AuthOptions): RequestHandler {
  return (req, res, next) => {
    if (options.mode === 'dev') {
      res.locals.admin = DEV_ADMIN;
      next();
      return;
    }
    const match = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
    if (!match) {
      next(new HttpError(401, 'UNAUTHORIZED', 'Authentication required'));
      return;
    }
    options
      .verify(match[1])
      .then(
        (token) => {
          if (!token.groups.includes(ADMIN_GROUP)) {
            throw new HttpError(403, 'FORBIDDEN', 'Admin permission required');
          }
          res.locals.admin = { sub: token.sub, email: token.email };
          next();
        },
        () => {
          throw new HttpError(401, 'UNAUTHORIZED', 'Invalid or expired token');
        },
      )
      .catch(next);
  };
}

/** Cognito ユーザープールの ID トークン検証（JWKS はライブラリがキャッシュ） */
export async function createCognitoVerifier(options: { userPoolId: string; clientId: string }): Promise<IdTokenVerifier> {
  const { CognitoJwtVerifier } = await import('aws-jwt-verify');
  const verifier = CognitoJwtVerifier.create({
    userPoolId: options.userPoolId,
    clientId: options.clientId,
    tokenUse: 'id',
  });
  return async (token) => {
    const payload = await verifier.verify(token);
    return {
      sub: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      groups: payload['cognito:groups'] ?? [],
    };
  };
}

/** AUTH_MODE=dev | cognito（既定）。dev は本番（NODE_ENV=production）では起動させない */
export async function createAuthOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<AuthOptions> {
  const mode = env.AUTH_MODE || 'cognito';
  if (mode === 'dev') {
    if (env.NODE_ENV === 'production') throw new Error('AUTH_MODE=dev must not be used in production');
    return { mode: 'dev' };
  }
  if (mode !== 'cognito') throw new Error(`Unknown AUTH_MODE: ${mode}`);
  if (!env.COGNITO_USER_POOL_ID || !env.COGNITO_CLIENT_ID) {
    // 公開 API は動かしたまま、管理 API は常に 401 にする（fail closed）
    console.warn('COGNITO_USER_POOL_ID / COGNITO_CLIENT_ID not set: admin API will reject all requests');
    return { mode: 'cognito', verify: () => Promise.reject(new Error('Cognito is not configured')) };
  }
  return {
    mode: 'cognito',
    verify: await createCognitoVerifier({ userPoolId: env.COGNITO_USER_POOL_ID, clientId: env.COGNITO_CLIENT_ID }),
  };
}
