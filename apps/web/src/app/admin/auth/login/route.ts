import { NextResponse } from 'next/server';
import {
  ADMIN_STATE_COOKIE,
  ADMIN_VERIFIER_COOKIE,
  buildAuthorizeUrl,
  cookieOptions,
  createPkce,
  getAdminAuthConfig,
} from '../../../../lib/adminAuth';

export const dynamic = 'force-dynamic';

/** Cognito Hosted UI へリダイレクト（PKCE + state） */
export function GET() {
  const config = getAdminAuthConfig();
  if (config.mode === 'dev' || !config.cognitoDomain || !config.clientId) {
    return NextResponse.redirect(`${config.baseUrl}/admin/login`);
  }
  const pkce = createPkce();
  const res = NextResponse.redirect(buildAuthorizeUrl(config, pkce));
  res.cookies.set(ADMIN_STATE_COOKIE, pkce.state, cookieOptions(config, 600));
  res.cookies.set(ADMIN_VERIFIER_COOKIE, pkce.verifier, cookieOptions(config, 600));
  return res;
}
