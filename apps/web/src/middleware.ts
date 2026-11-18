import { NextResponse, type NextRequest } from 'next/server';
import { negotiateLocale } from './i18n/negotiate';

/** ID トークンの cookie 名（lib/adminAuth と同じ。middleware は Edge で動くため node:crypto を含むモジュールを読まない） */
const ADMIN_TOKEN_COOKIE = 'admin_id_token';
const ADMIN_PUBLIC_PATHS = ['/admin/login', '/admin/auth/'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 管理画面: cookie が無ければログインへ（トークンの検証は API 側の requireAdmin で行う）
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    const isPublic = ADMIN_PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p));
    if (!isPublic && !request.cookies.has(ADMIN_TOKEN_COOKIE)) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
    return NextResponse.next();
  }

  // `/` を Accept-Language の最適一致（なければ en）へリダイレクト
  const locale = negotiateLocale(request.headers.get('accept-language'));
  return NextResponse.redirect(new URL(`/${locale}`, request.url));
}

export const config = {
  matcher: ['/', '/admin', '/admin/:path*'],
};
