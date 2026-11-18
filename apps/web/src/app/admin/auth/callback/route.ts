import { NextResponse, type NextRequest } from 'next/server';
import {
  ADMIN_STATE_COOKIE,
  ADMIN_TOKEN_COOKIE,
  ADMIN_VERIFIER_COOKIE,
  cookieOptions,
  exchangeCode,
  getAdminAuthConfig,
} from '../../../../lib/adminAuth';

export const dynamic = 'force-dynamic';

/** Hosted UI からの戻り。state を照合し、認可コードを ID トークンに交換して httpOnly cookie に保存 */
export async function GET(request: NextRequest) {
  const config = getAdminAuthConfig();
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const expectedState = request.cookies.get(ADMIN_STATE_COOKIE)?.value;
  const verifier = request.cookies.get(ADMIN_VERIFIER_COOKIE)?.value;

  const fail = () => NextResponse.redirect(`${config.baseUrl}/admin/login?error=1`);
  if (!code || !state || !verifier || state !== expectedState) return fail();

  try {
    const { idToken, expiresIn } = await exchangeCode(config, code, verifier);
    const res = NextResponse.redirect(`${config.baseUrl}/admin`);
    res.cookies.set(ADMIN_TOKEN_COOKIE, idToken, cookieOptions(config, expiresIn));
    res.cookies.delete({ name: ADMIN_STATE_COOKIE, path: '/admin' });
    res.cookies.delete({ name: ADMIN_VERIFIER_COOKIE, path: '/admin' });
    return res;
  } catch (err) {
    console.error(err);
    return fail();
  }
}
