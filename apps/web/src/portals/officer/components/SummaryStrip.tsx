// Inbox summary (Spec C §5.1). Each tile is a filter. No counts endpoint exists yet, so totals come from
// page_size=1 queries; "due today" counts the SLA-sorted head of the queue (contract gap G8).
import type { ComponentType, SVGProps } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueries } from '@tanstack/react-query';
import { AlarmClock, CalendarClock, FolderOpen, ShieldQuestion, Siren } from 'lucide-react';
import { api, qk, type InboxQuery } from '@/lib/api/endpoints';
import { Skeleton } from '@/design/components';
import { useLangFormat } from '@/lib/i18n/useLangFormat';
import { cn } from '@/lib/utils';
import { isDueToday } from '@/portals/gov-shared/lib/inbox';
import type { Filters } from '@/portals/gov-shared/hooks/useUrlFilters';

const count = (q: InboxQuery) => ({
  queryKey: qk.officer.inbox({ ...q, page_size: 1 }),
  queryFn: ({ signal }: { signal: AbortSignal }) => api.officerInbox({ ...q, page_size: 1 }, signal),
  select: (d: { total: number }) => d.total,
});

interface Tile {
  key: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  tone: string;
  filter: Filters;
}

const TILES: Tile[] = [
  { key: 'open', icon: FolderOpen, tone: 'text-text', filter: {} },
  { key: 'critical', icon: Siren, tone: 'text-prio-critical-fg', filter: { priority: 'critical' } },
  { key: 'overdue', icon: AlarmClock, tone: 'text-danger', filter: { overdue: 'true' } },
  { key: 'due_today', icon: CalendarClock, tone: 'text-warning', filter: { due: 'today' } },
  {
    key: 'pending',
    icon: ShieldQuestion,
    tone: 'text-ai',
    filter: { status: 'resolved_pending_verification' },
  },
];

export function SummaryStrip({
  filters,
  onSelect,
}: {
  filters: Filters;
  onSelect: (f: Filters) => void;
}) {
  const { t } = useTranslation('gov');
  const fmt = useLangFormat();
  const results = useQueries({
    queries: [
      count({}),
      count({ priority: 'critical' }),
      count({ overdue: true }),
      {
        queryKey: qk.officer.inbox({ sort: 'sla', page_size: 100 }),
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          api.officerInbox({ sort: 'sla', page_size: 100 }, signal),
        select: (d: Awaited<ReturnType<typeof api.officerInbox>>) => d.items.filter((g) => isDueToday(g)).length,
      },
      count({ status: 'resolved_pending_verification' }),
    ],
  });
  const activeKey = (f: Filters) =>
    Object.entries(f).every(([k, v]) => filters[k as keyof Filters] === v) &&
    Object.keys(f).length === Object.keys(filters).length;

  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" aria-label={t('inbox.summary')}>
      {TILES.map((tile, i) => {
        const r = results[i];
        const active = activeKey(tile.filter);
        return (
          <li key={tile.key} className={cn(i === 0 && 'col-span-2 sm:col-span-1')}>
            <button
              type="button"
              aria-pressed={active}
              data-testid={`summary-${tile.key}`}
              onClick={() => onSelect(tile.filter)}
              className={cn(
                'bg-surface hover:bg-surface-2 flex min-h-[60px] w-full items-center gap-3 rounded-[var(--radius-md)] border px-3 py-2 text-start transition-colors',
                active && 'border-primary/70',
              )}
            >
              <tile.icon className={cn('size-5 shrink-0', tile.tone)} aria-hidden />
              <span className="min-w-0">
                <span className="text-muted-foreground block truncate text-xs">
                  {t(`inbox.tile.${tile.key}`)}
                </span>
                {r.data == null ? (
                  r.isError ? (
                    <span className="font-display text-xl font-semibold">–</span>
                  ) : (
                    <Skeleton className="mt-1 h-6 w-10" />
                  )
                ) : (
                  <span className="font-display tabular block text-xl leading-tight font-semibold">
                    {fmt.number(r.data)}
                  </span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
