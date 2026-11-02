// PLACEHOLDER command center (Laptop C replaces it).
import { useQuery } from '@tanstack/react-query';
import { ErrorState, KPIStat, StatSkeleton } from '@/design/components';
import { api, qk } from '@/lib/api/endpoints';
import { GovPlaceholder } from '@/portals/gov-shared/components/GovPlaceholder';

export default function CommandCenterStub() {
  const q = useQuery({
    queryKey: qk.admin.kpis(30),
    queryFn: ({ signal }) => api.adminKpis({ days: 30 }, signal),
  });
  return (
    <GovPlaceholder titleKey="nav.admin">
      {q.isPending ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <StatSkeleton key={i} />
          ))}
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="kpi-stub">
          <KPIStat label="total" value={q.data.total} delta={q.data.deltas.total} />
          <KPIStat label="open" value={q.data.open} delta={q.data.deltas.open} upIsGood={false} />
          <KPIStat label="overdue" value={q.data.overdue} delta={q.data.deltas.overdue} upIsGood={false} />
          <KPIStat label="sla_compliance_pct" value={q.data.sla_compliance_pct} decimals={1} suffix="%" />
        </div>
      )}
    </GovPlaceholder>
  );
}
