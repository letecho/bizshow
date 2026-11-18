import { NextResponse } from 'next/server';
import { ADMIN_TOKEN_COOKIE, cookieOptions, getAdminAuthConfig } from '../../../../lib/adminAuth';

export const dynamic = 'force-dynamic';

/** AUTH_MODE=dev 専用。API も dev モードでトークンを検証しないため、cookie は画面遷移用の目印のみ */
export function POST() {
  const config = getAdminAuthConfig();
  if (config.mode !== 'dev') return new NextResponse(null, { status: 404 });
  const res = NextResponse.redirect(`${config.baseUrl}/admin`, 303);
  res.cookies.set(ADMIN_TOKEN_COOKIE, 'dev', cookieOptions(config, 60 * 60 * 8));
  return res;
}
