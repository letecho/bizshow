import { cookies } from 'next/headers';
import { ADMIN_TOKEN_COOKIE } from './adminAuth';
import { API_URL } from './api';

/** 管理 API をサーバー側から呼ぶ。cookie の ID トークンを Bearer で渡す */
export async function adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = (await cookies()).get(ADMIN_TOKEN_COOKIE)?.value;
  return fetch(`${API_URL}/api/v1/admin${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
}
