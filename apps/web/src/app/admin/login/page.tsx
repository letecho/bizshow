import { getAdminAuthConfig } from '../../../lib/adminAuth';
import styles from '../admin.module.css';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ error?: string }> };

export default async function AdminLoginPage({ searchParams }: Props) {
  const { error } = await searchParams;
  const config = getAdminAuthConfig();

  return (
    <main className={styles.main}>
      <div className={styles.card}>
        <h1>管理者ログイン</h1>
        {error && <p className={styles.error}>ログインに失敗しました。もう一度お試しください。</p>}
        {config.mode === 'dev' ? (
          <form method="post" action="/admin/auth/dev-login">
            <p>AUTH_MODE=dev: ローカル用の固定管理者でログインします。</p>
            <button type="submit" className={styles.button}>
              開発用ログイン
            </button>
          </form>
        ) : (
          <>
            <p>運営アカウント（MFA 必須）でログインしてください。</p>
            <a href="/admin/auth/login" className={styles.button}>
              ログイン
            </a>
          </>
        )}
      </div>
    </main>
  );
}
