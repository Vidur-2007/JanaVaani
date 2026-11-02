// P0 nearby: base map + list from /public/nearby (Spec A §5.14 — P5 completes it).
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { DepartmentBadge, EmptyState, ErrorState, ListSkeleton, MapView, PageTransition, StatusChip } from '@/design/components';
import { api, qk } from '@/lib/api/endpoints';
import { pickLocalized } from '@/lib/localized';

export default function Nearby() {
  const { t, i18n } = useTranslation('citizen');
  const params = { lat: 17.4968, lng: 78.3614, radius_m: 3000 };
  const q = useQuery({ queryKey: qk.public.nearby(params), queryFn: ({ signal }) => api.publicNearby(params, signal) });
  return (
    <PageTransition className="space-y-4">
      <h1 className="font-display text-2xl font-semibold">{t('nearby.title')}</h1>
      <MapView center={{ lat: params.lat, lng: params.lng }} zoom={13} height={280} />
      {q.isPending ? (
        <ListSkeleton rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <EmptyState title={t('home.empty_title')} />
      ) : (
        <ul className="space-y-2">
          {q.data.slice(0, 10).map((n) => {
            const title = pickLocalized(n.title, i18n.language);
            return (
              <li key={n.grievance_id} className="bg-surface flex flex-wrap items-center gap-2 rounded-[var(--radius-lg)] border p-3">
                <DepartmentBadge department={n.category} size="sm" iconOnly />
                <span className="min-w-0 flex-1 truncate" lang={title.lang} dir={title.dir}>
                  {title.text}
                </span>
                <StatusChip status={n.status} size="sm" />
                <span className="text-muted-foreground tabular font-mono text-xs">{n.distance_m} m</span>
              </li>
            );
          })}
        </ul>
      )}
    </PageTransition>
  );
}
