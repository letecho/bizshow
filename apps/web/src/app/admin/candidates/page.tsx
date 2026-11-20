import { redirect } from 'next/navigation';
import { CANDIDATE_STATUSES, type AdminCandidate } from '@fss/shared/collector';
import { INITIAL_CATEGORY_NAMES, PREFECTURES, SERVICE_CATEGORIES } from '@fss/shared/domain';
import { AdminHeader } from '../../../components/admin/AdminHeader';
import { adminFetch } from '../../../lib/adminApi';
import { toQueryString } from '../../../lib/api';
import styles from '../admin.module.css';
import { CANDIDATE_STATUS_LABELS, ENTITY_TYPE_LABELS, MATCH_TYPE_LABELS } from './labels';

export const dynamic = 'force-dynamic';

const LIMIT = 50;

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

type ListBody = { data: AdminCandidate[]; meta: { page: number; total: number; sources: { id: string; name: string }[] } };

const str = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');

/** 掲載候補の一覧（F-113）。対象言語の根拠あり → score 降順 */
export default async function CandidatesPage({ searchParams }: Props) {
  const params = await searchParams;
  const filters = {
    status: str(params.status),
    source: str(params.source),
    category: str(params.category),
    prefecture: str(params.prefecture),
    minScore: str(params.minScore),
    targetLang: str(params.targetLang),
  };
  const page = Math.max(1, Number.parseInt(str(params.page), 10) || 1);
  const query = toQueryString({ ...filters, page: String(page), limit: String(LIMIT) });
  const res = await adminFetch(`/candidates?${query}`).catch(() => null);
  if (res && (res.status === 401 || res.status === 403)) redirect('/admin/login');
  const body = res?.ok ? ((await res.json()) as ListBody) : null;
  const pageHref = (p: number) => `/admin/candidates?${toQueryString({ ...filters, page: String(p) })}`;
  const lastPage = body ? Math.max(1, Math.ceil(body.meta.total / LIMIT)) : 1;

  return (
    <main className={styles.main}>
      <AdminHeader title="掲載候補" />
      <form method="get" className={styles.filters} aria-label="絞り込み">
        <select name="status" defaultValue={filters.status} aria-label="状態">
          {CANDIDATE_STATUSES.map((s) => (
            <option key={s} value={s === 'pending' ? '' : s}>
              {CANDIDATE_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select name="source" defaultValue={filters.source} aria-label="収集元">
          <option value="">すべての収集元</option>
          {body?.meta.sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select name="category" defaultValue={filters.category} aria-label="カテゴリ">
          <option value="">すべてのカテゴリ</option>
          {SERVICE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}（{INITIAL_CATEGORY_NAMES[c].en}）
            </option>
          ))}
        </select>
        <select name="prefecture" defaultValue={filters.prefecture} aria-label="都道府県">
          <option value="">すべての都道府県</option>
          {PREFECTURES.map((p) => (
            <option key={p.code} value={p.code}>
              {p.ja}
            </option>
          ))}
        </select>
        <input type="number" name="minScore" min={0} max={100} defaultValue={filters.minScore} placeholder="最低スコア" aria-label="最低スコア" />
        <label>
          <input type="checkbox" name="targetLang" value="1" defaultChecked={filters.targetLang === '1'} /> 対象言語の根拠ありのみ
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
                  <th>名称</th>
                  <th>収集元</th>
                  <th>カテゴリ / 地域</th>
                  <th>スコア</th>
                  <th>対象言語</th>
                  <th>種類</th>
                  <th>名寄せ</th>
                  <th>状態</th>
                </tr>
              </thead>
              <tbody>
                {body.data.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <a href={`/admin/candidates/${encodeURIComponent(c.id)}`}>{c.extracted.name.ja ?? c.extracted.name.en ?? c.sourceRecordId}</a>
                    </td>
                    <td>{c.sourceName}</td>
                    <td>
                      {c.extracted.category} / {c.extracted.prefecture}
                    </td>
                    <td>{c.score}</td>
                    <td>{c.hasTargetLanguage ? <span className={styles.badgeOn}>根拠あり</span> : '-'}</td>
                    <td>{ENTITY_TYPE_LABELS[c.entityType]}</td>
                    <td>{MATCH_TYPE_LABELS[c.matchType]}</td>
                    <td>{CANDIDATE_STATUS_LABELS[c.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {lastPage > 1 && (
            <nav aria-label="ページ" className={styles.filters}>
              {page > 1 && <a href={pageHref(page - 1)}>← 前へ</a>}
              <span>
                {page} / {lastPage}
              </span>
              {page < lastPage && <a href={pageHref(page + 1)}>次へ →</a>}
            </nav>
          )}
        </>
      )}
    </main>
  );
}
