import { redirect } from 'next/navigation';
import { categoryName, pickText, type AdminService } from '@fss/shared/domain';
import { AdminHeader } from '../../components/admin/AdminHeader';
import { adminFetch } from '../../lib/adminApi';
import { getCategories, toQueryString } from '../../lib/api';
import { setPublished } from './actions';
import styles from './admin.module.css';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** 掲載一覧（キーワード・公開状態で絞り込み、公開切替） */
export default async function AdminServicesPage({ searchParams }: Props) {
  const params = await searchParams;
  // stale=1: 収集した掲載のうち COLLECTOR_STALE_DAYS を過ぎても確認できていないもの（F-116）
  const stale = params.stale === '1';
  const query = toQueryString({ q: params.q, published: params.published, stale: stale ? 'true' : undefined, limit: '100' });
  const [res, categories] = await Promise.all([adminFetch(`/services?${query}`).catch(() => null), getCategories()]);
  if (res && (res.status === 401 || res.status === 403)) redirect('/admin/login');
  const body = res?.ok ? ((await res.json()) as { data: AdminService[]; meta: { total: number } }) : null;
  const q = typeof params.q === 'string' ? params.q : '';
  const published = typeof params.published === 'string' ? params.published : '';

  return (
    <main className={styles.main}>
      <AdminHeader title={stale ? '掲載一覧（確認期限切れ）' : '掲載一覧'} />
      <form method="get" className={styles.filters} role="search">
        <input type="search" name="q" defaultValue={q} placeholder="名前・説明・slug" maxLength={100} aria-label="キーワード" />
        <select name="published" defaultValue={published} aria-label="公開状態">
          <option value="">すべて</option>
          <option value="true">公開</option>
          <option value="false">非公開</option>
        </select>
        <label>
          <input type="checkbox" name="stale" value="1" defaultChecked={stale} /> 確認期限切れ（収集した掲載）のみ
        </label>
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
                  <th>最終確認日</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {body.data.map((s) => (
                  <tr key={s.id}>
                    <td>{pickText(s.name, 'ja')}</td>
                    <td>{s.slug}</td>
                    <td>
                      {s.categories.map((code) => categoryName(categories, code, 'ja')).join('・')} / {s.prefecture}
                    </td>
                    <td>
                      <span className={s.isPublished ? styles.badgeOn : styles.badgeOff}>
                        {s.isPublished ? '公開' : '非公開'}
                      </span>
                    </td>
                    <td>{s.lastVerifiedAt ? s.lastVerifiedAt.slice(0, 10) : s.sources.length > 0 ? '未確認' : '-'}</td>
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
