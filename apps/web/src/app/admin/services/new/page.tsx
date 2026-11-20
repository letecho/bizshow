import { AdminHeader } from '../../../../components/admin/AdminHeader';
import { ServiceForm } from '../../../../components/admin/ServiceForm';
import { getCategories } from '../../../../lib/api';
import { createService } from '../../actions';
import styles from '../../admin.module.css';

export const dynamic = 'force-dynamic';

export default async function NewServicePage() {
  const categories = await getCategories();
  return (
    <main className={styles.main}>
      <AdminHeader title="掲載の新規作成" />
      <ServiceForm action={createService} categories={categories} />
    </main>
  );
}
