// P0 "My complaints" list (Spec A §5.8 — P4 adds filters and search).
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { EmptyState, ErrorState, ListSkeleton, PageTransition } from '@/design/components';
import { api, qk } from '@/lib/api/endpoints';
import { GrievanceCard } from '../components/GrievanceCard';

export default function Complaints() {
  const { t } = useTranslation('citizen');
  const q = useQuery({
    queryKey: qk.grievances.mine(),
    queryFn: ({ signal }) => api.myGrievances({}, signal),
  });
  return (
    <PageTransition className="space-y-4">
      <h1 className="font-display text-2xl font-semibold">{t('complaints.title')}</h1>
      {q.isPending ? (
        <ListSkeleton />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.items.length === 0 ? (
        <EmptyState title={t('home.empty_title')} description={t('home.empty_body')} />
      ) : (
        <div className="grid gap-3">
          {q.data.items.map((g) => (
            <GrievanceCard key={g.id} g={g} />
          ))}
        </div>
      )}
    </PageTransition>
  );
}
