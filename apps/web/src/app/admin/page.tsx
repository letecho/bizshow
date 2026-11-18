import { redirect } from 'next/navigation';
import { adminFetch } from '../../lib/adminApi';
import styles from './admin.module.css';

export const dynamic = 'force-dynamic';

export default async function AdminHomePage() {
  const res = await adminFetch('/me').catch(() => null);
  if (res && (res.status === 401 || res.status === 403)) redirect('/admin/login');
  const admin = res?.ok ? ((await res.json()) as { data: { email?: string; sub: string } }).data : null;

  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <h1>管理画面</h1>
        <form method="post" action="/admin/auth/logout">
          <button type="submit" className={styles.secondary}>
            ログアウト
          </button>
        </form>
      </div>
      {admin ? (
        <p>ログイン中: {admin.email ?? admin.sub}</p>
      ) : (
        <p className={styles.error}>API に接続できませんでした。時間をおいて再度お試しください。</p>
      )}
    </main>
  );
}
