import { AdminHeader } from '../../../../components/admin/AdminHeader';
import { ServiceForm } from '../../../../components/admin/ServiceForm';
import { createService } from '../../actions';
import styles from '../../admin.module.css';

export const dynamic = 'force-dynamic';

export default function NewServicePage() {
  return (
    <main className={styles.main}>
      <AdminHeader title="掲載の新規作成" />
      <ServiceForm action={createService} />
    </main>
  );
}
