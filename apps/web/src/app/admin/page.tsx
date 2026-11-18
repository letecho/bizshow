import { redirect } from 'next/navigation';
import { pickText, type AdminService } from '@fss/shared/domain';
import { AdminHeader } from '../../components/admin/AdminHeader';
import { adminFetch } from '../../lib/adminApi';
import { toQueryString } from '../../lib/api';
import { setPublished } from './actions';
import styles from './admin.module.css';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** 掲載一覧（キーワード・公開状態で絞り込み、公開切替） */
export default async function AdminServicesPage({ searchParams }: Props) {
  const params = await searchParams;
  const query = toQueryString({ q: params.q, published: params.published, limit: '100' });
  const res = await adminFetch(`/services?${query}`).catch(() => null);
  if (res && (res.status === 401 || res.status === 403)) redirect('/admin/login');
  const body = res?.ok ? ((await res.json()) as { data: AdminService[]; meta: { total: number } }) : null;
  const q = typeof params.q === 'string' ? params.q : '';
  const published = typeof params.published === 'string' ? params.published : '';

  return (
    <main className={styles.main}>
      <AdminHeader title="掲載一覧" />
      <form method="get" className={styles.filters} role="search">
        <input type="search" name="q" defaultValue={q} placeholder="名前・説明・slug" maxLength={100} />
        <select name="published" defaultValue={published}>
          <option value="">すべて</option>
          <option value="true">公開</option>
          <option value="false">非公開</option>
        </select>
        <button type="submit" className={styles.button}>
          絞り込み
        </button>
      </form>
      {!body ? (
        <p className={styles.error}>API に接続できませんでした。</p>
      ) : (
        <>
          <p>{body.meta.total} 件</p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>名前</th>
                  <th>slug</th>
                  <th>カテゴリ / 地域</th>
                  <th>状態</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {body.data.map((s) => (
                  <tr key={s.id}>
                    <td>{pickText(s.name, 'ja')}</td>
                    <td>{s.slug}</td>
                    <td>
                      {s.category} / {s.prefecture}
                    </td>
                    <td>
                      <span className={s.isPublished ? styles.badgeOn : styles.badgeOff}>
                        {s.isPublished ? '公開' : '非公開'}
                      </span>
                    </td>
                    <td>
                      <a href={`/admin/services/${s.id}/edit`}>編集</a>{' '}
                      <form action={setPublished.bind(null, s.id, !s.isPublished)} className={styles.inline}>
                        <button type="submit" className={styles.linkButton}>
                          {s.isPublished ? '非公開にする' : '公開する'}
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
