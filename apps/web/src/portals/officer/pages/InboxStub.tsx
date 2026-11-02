// PLACEHOLDER inbox (Laptop C replaces it). Shows how pages use api + qk + shared components in mock mode.
import { useQuery } from '@tanstack/react-query';
import { DepartmentBadge, ErrorState, ListSkeleton, PriorityChip, SLACountdown, StatusChip } from '@/design/components';
import { api, qk } from '@/lib/api/endpoints';
import { GovPlaceholder } from '@/portals/gov-shared/components/GovPlaceholder';

export default function InboxStub() {
  const q = useQuery({ queryKey: qk.officer.inbox(), queryFn: ({ signal }) => api.officerInbox({}, signal) });
  return (
    <GovPlaceholder titleKey="nav.officer">
      {q.isPending ? (
        <ListSkeleton rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <ul className="space-y-2" data-testid="inbox-stub">
          {q.data.items.slice(0, 8).map((g) => (
            <li key={g.id} className="bg-surface flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border p-3">
              <PriorityChip priority={g.priority} score={g.priority_score} size="sm" />
              <span className="font-mono text-xs">{g.id}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{g.title.en}</span>
              <DepartmentBadge department={g.category} size="sm" />
              <StatusChip status={g.status} size="sm" />
              <SLACountdown sla={g.sla} compact />
            </li>
          ))}
        </ul>
      )}
    </GovPlaceholder>
  );
}
