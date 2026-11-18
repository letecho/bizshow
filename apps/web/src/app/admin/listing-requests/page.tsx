import { redirect } from 'next/navigation';
import { LISTING_REQUEST_STATUSES, isSupportedLocale, type ListingRequest } from '@fss/shared/domain';
import { AdminHeader } from '../../../components/admin/AdminHeader';
import { ApproveForm } from '../../../components/admin/ApproveForm';
import { adminFetch } from '../../../lib/adminApi';
import { approveRequest, rejectRequest } from '../actions';
import styles from '../admin.module.css';

export const dynamic = 'force-dynamic';

const STATUS_LABELS = { pending: '審査待ち', approved: '承認済み', rejected: '却下' } as const;

/** 英語名から slug の候補を作る（管理者が承認時に修正できる） */
function suggestSlug(request: ListingRequest): string {
  const base = request.name.en
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return [base || 'service', request.prefecture].join('-');
}

type Props = { searchParams: Promise<{ status?: string }> };

export default async function ListingRequestsPage({ searchParams }: Props) {
  const { status: rawStatus } = await searchParams;
  const status = (LISTING_REQUEST_STATUSES as readonly string[]).includes(rawStatus ?? '') ? rawStatus! : 'pending';
  const res = await adminFetch(`/listing-requests?status=${status}&limit=100`).catch(() => null);
  if (res && (res.status === 401 || res.status === 403)) redirect('/admin/login');
  const body = res?.ok ? ((await res.json()) as { data: ListingRequest[]; meta: { total: number } }) : null;

  return (
    <main className={styles.main}>
      <AdminHeader title="掲載申請" />
      <nav className={styles.filters}>
        {LISTING_REQUEST_STATUSES.map((s) => (
          <a key={s} href={`/admin/listing-requests?status=${s}`} aria-current={s === status ? 'page' : undefined}>
            {STATUS_LABELS[s]}
          </a>
        ))}
      </nav>
      {!body ? (
        <p className={styles.error}>API に接続できませんでした。</p>
      ) : body.data.length === 0 ? (
        <p>該当する申請はありません。</p>
      ) : (
        body.data.map((r) => (
          <section key={r.id} className={styles.request}>
            <h2>{r.name.en}</h2>
            <dl>
              <dt>状態</dt>
              <dd>{STATUS_LABELS[r.status]}</dd>
              <dt>申請日時</dt>
              <dd>{new Date(r.createdAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</dd>
              <dt>カテゴリ / 地域</dt>
              <dd>
                {r.category} / {r.prefecture}
                {r.city ? ` / ${r.city}` : ''}
              </dd>
              <dt>対応言語</dt>
              <dd>{r.supportedLanguages.join(', ')}</dd>
              <dt>名前</dt>
              <dd>
                {Object.entries(r.name)
                  .filter(([l, v]) => isSupportedLocale(l) && v)
                  .map(([l, v]) => `${l}: ${v}`)
                  .join(' / ')}
              </dd>
              <dt>説明（en）</dt>
              <dd>{r.description.en}</dd>
              {r.phone && (
                <>
                  <dt>電話</dt>
                  <dd>{r.phone}</dd>
                </>
              )}
              {r.websiteUrl && (
                <>
                  <dt>Web サイト</dt>
                  <dd>
                    <a href={r.websiteUrl} target="_blank" rel="noopener noreferrer">
                      {r.websiteUrl}
                    </a>
                  </dd>
                </>
              )}
              <dt>担当者</dt>
              <dd>
                {r.contactName}（{r.contactEmail}）
              </dd>
            </dl>
            {r.status === 'pending' && (
              <>
                <ApproveForm action={approveRequest.bind(null, r.id)} suggestedSlug={suggestSlug(r)} />
                <form action={rejectRequest.bind(null, r.id)}>
                  <p>
                    <button type="submit" className={styles.danger}>
                      却下する
                    </button>
                  </p>
                </form>
              </>
            )}
          </section>
        ))
      )}
    </main>
  );
}
