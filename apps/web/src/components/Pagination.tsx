import styles from './Pagination.module.css';

/** 現在のクエリを保ったまま page だけ変えたリンクを出す */
export function Pagination({
  basePath,
  query,
  page,
  limit,
  total,
  labels,
}: {
  basePath: string;
  query: string;
  page: number;
  limit: number;
  total: number;
  labels: { prev: string; next: string; nav: string };
}) {
  const hrefFor = (p: number) => {
    const params = new URLSearchParams(query);
    params.set('page', String(p));
    return `${basePath}?${params.toString()}`;
  };
  const hasPrev = page > 1;
  const hasNext = page * limit < total;
  if (!hasPrev && !hasNext) return null;

  return (
    <nav aria-label={labels.nav} className={styles.nav}>
      {hasPrev ? (
        <a href={hrefFor(page - 1)} rel="prev">
          ← {labels.prev}
        </a>
      ) : (
        <span />
      )}
      {hasNext && (
        <a href={hrefFor(page + 1)} rel="next">
          {labels.next} →
        </a>
      )}
    </nav>
  );
}
