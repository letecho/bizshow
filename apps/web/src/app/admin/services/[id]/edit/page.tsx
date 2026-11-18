import { notFound, redirect } from 'next/navigation';
import type { AdminService } from '@fss/shared/domain';
import { AdminHeader } from '../../../../../components/admin/AdminHeader';
import { ServiceForm } from '../../../../../components/admin/ServiceForm';
import { adminFetch } from '../../../../../lib/adminApi';
import { deleteService, updateService } from '../../../actions';
import styles from '../../../admin.module.css';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export default async function EditServicePage({ params }: Props) {
  const { id } = await params;
  const res = await adminFetch(`/services/${encodeURIComponent(id)}`);
  if (res.status === 401 || res.status === 403) redirect('/admin/login');
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`Failed to load service: ${res.status}`);
  const { data: service } = (await res.json()) as { data: AdminService };

  return (
    <main className={styles.main}>
      <AdminHeader title={`編集: ${service.slug}`} />
      <ServiceForm action={updateService.bind(null, id)} service={service} />
      <form action={deleteService.bind(null, id)}>
        <p>
          <button type="submit" className={styles.danger}>
            この掲載を削除する
          </button>
        </p>
      </form>
    </main>
  );
}
