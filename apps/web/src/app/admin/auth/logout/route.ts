import { NextResponse } from 'next/server';
import { ADMIN_TOKEN_COOKIE, buildLogoutUrl, getAdminAuthConfig } from '../../../../lib/adminAuth';

export const dynamic = 'force-dynamic';

/** cookie を削除し、Cognito のセッションもログアウトする */
export function POST() {
  const config = getAdminAuthConfig();
  const to = config.mode === 'cognito' && config.cognitoDomain ? buildLogoutUrl(config) : `${config.baseUrl}/admin/login`;
  const res = NextResponse.redirect(to, 303);
  res.cookies.delete({ name: ADMIN_TOKEN_COOKIE, path: '/admin' });
  return res;
}
