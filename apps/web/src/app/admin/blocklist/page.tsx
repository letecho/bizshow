import { redirect } from 'next/navigation';
import type { CrawlBlockEntry } from '@fss/shared/domain';
import { AdminHeader } from '../../../components/admin/AdminHeader';
import { BLOCK_REASON_LABELS, BlocklistForm } from '../../../components/admin/BlocklistForm';
import { adminFetch } from '../../../lib/adminApi';
import { createBlockEntry, deleteBlockEntry } from '../actions';
import styles from '../admin.module.css';

export const dynamic = 'force-dynamic';

/** 収集・クロールのブロックリスト（一覧・追加・削除、F-116）。登録済みの事業者は収集で候補を作らない */
export default async function BlocklistPage() {
  const res = await adminFetch('/blocklist').catch(() => null);
  if (res && (res.status === 401 || res.status === 403)) redirect('/admin/login');
  const body = res?.ok ? ((await res.json()) as { data: CrawlBlockEntry[]; meta: { total: number } }) : null;

  return (
    <main className={styles.main}>
      <AdminHeader title="ブロックリスト" />
      <p>
        登録したドメイン（サブドメインを含む）・法人番号の事業者は、収集で掲載候補を作りません。掲載中の情報を止めるときは、掲載一覧から非公開にしてください。
      </p>
      <section className={styles.card} aria-labelledby="blocklist-add">
        <h2 id="blocklist-add">追加</h2>
        <BlocklistForm action={createBlockEntry} />
      </section>
      {!body ? (
        <p className={styles.error}>API に接続できませんでした。</p>
      ) : (
        <>
          <p>{body.meta.total} 件</p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>ドメイン</th>
                  <th>法人番号</th>
                  <th>理由</th>
                  <th>メモ</th>
                  <th>登録日</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {body.data.map((e) => (
                  <tr key={e.id}>
                    <td>{e.domain ?? '-'}</td>
                    <td>{e.corporateNumber ?? '-'}</td>
                    <td>{BLOCK_REASON_LABELS[e.reason] ?? e.reason}</td>
                    <td>{e.note ?? ''}</td>
                    <td>{e.createdAt.slice(0, 10)}</td>
                    <td>
                      <form action={deleteBlockEntry.bind(null, e.id)} className={styles.inline}>
                        <button type="submit" className={styles.linkButton} aria-label={`${e.domain ?? e.corporateNumber} を削除`}>
                          削除
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
