import styles from '../../app/admin/admin.module.css';

/** 管理画面共通のヘッダー（ナビ・ログアウト） */
export function AdminHeader({ title }: { title: string }) {
  return (
    <div className={styles.header}>
      <h1>{title}</h1>
      <nav className={styles.nav}>
        <a href="/admin">掲載一覧</a>
        <a href="/admin/services/new">新規作成</a>
        <a href="/admin/listing-requests">掲載申請</a>
        <a href="/admin/candidates">掲載候補</a>
        <a href="/admin/blocklist">ブロックリスト</a>
        <form method="post" action="/admin/auth/logout">
          <button type="submit" className={styles.secondary}>
            ログアウト
          </button>
        </form>
      </nav>
    </div>
  );
}
