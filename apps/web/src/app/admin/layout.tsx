import type { Metadata } from 'next';
import styles from './admin.module.css';

export const metadata: Metadata = { title: '管理画面', robots: { index: false, follow: false } };

/** 管理画面（運営向け・日本語のみ）。[locale] とは別のルートレイアウト */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className={styles.body}>{children}</body>
    </html>
  );
}
