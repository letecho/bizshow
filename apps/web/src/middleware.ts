import { NextResponse, type NextRequest } from 'next/server';
import { negotiateLocale } from './i18n/negotiate';

/** `/` を Accept-Language の最適一致（なければ en）へリダイレクト */
export function middleware(request: NextRequest) {
  const locale = negotiateLocale(request.headers.get('accept-language'));
  return NextResponse.redirect(new URL(`/${locale}`, request.url));
}

export const config = {
  matcher: '/',
};
