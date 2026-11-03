// Officer inbox (Spec C §5.1): summary strip, priority-ordered queue, search, bulk actions, realtime arrivals.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { toast } from 'sonner';
import type { RowSelectionState } from '@tanstack/react-table';
import type { Grievance } from '@contracts/types';
import { Button } from '@/design/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/design/ui/select';
import { DepartmentBadge, ErrorState, ListSkeleton, PageTransition, PriorityChip } from '@/design/components';
import { useLangFormat } from '@/lib/i18n/useLangFormat';
import { useLiveEvent } from '@/lib/live/useLiveEvents';
import { DataTable, type DataColumn } from '@/portals/gov-shared/components/DataTable';
import { ExportMenu } from '@/portals/gov-shared/components/ExportMenu';
import { FilterBar } from '@/portals/gov-shared/components/FilterBar';
import { GovEmpty } from '@/portals/gov-shared/components/GovEmpty';
import { GovStatusChip } from '@/portals/gov-shared/components/GovStatusChip';
import { SLACountdownGov } from '@/portals/gov-shared/components/SLACountdownGov';
import { useFreshIds } from '@/portals/gov-shared/hooks/useFreshIds';
import { FILTER_KEYS, useUrlFilters } from '@/portals/gov-shared/hooks/useUrlFilters';
import { BulkBar } from '../components/BulkBar';
import { CaseCard, CaseTitle, EscalationDots } from '../components/InboxRow';
import { InboxTabs } from '../components/InboxTabs';
import { SummaryStrip } from '../components/SummaryStrip';
import { PAGE_SIZE, useInboxData, type InboxSort } from '../hooks/useInboxData';

const getRowId = (g: Grievance) => g.id;

export default function Inbox() {
  const { t } = useTranslation('gov');
  const fmt = useLangFormat();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { filters, setFilters, clear, activeCount } = useUrlFilters();
  const sort = (params.get('sort') as InboxSort) || 'priority';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [selection, setSelection] = useState<RowSelectionState>({});

  const data = useInboxData(filters, sort, page);
  const fresh = useFreshIds(data.items.map(getRowId), JSON.stringify(data.query), data.settled);

  useLiveEvent((e) => {
    if (e.kind === 'grievance_created') toast(t('inbox.new_case'));
  });

  const setParam = (k: string, v: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (v) next.set(k, v);
        else next.delete(k);
        return next;
      },
      { replace: true },
    );

  const columns = useMemo<DataColumn<Grievance>[]>(
    () => [
      {
        id: 'priority',
        title: t('inbox.column.priority'),
        header: t('inbox.column.priority'),
        cell: ({ row }) => (
          <PriorityChip priority={row.original.priority} score={row.original.priority_score} size="sm" />
        ),
      },
      {
        id: 'case',
        header: t('inbox.column.case'),
        cell: ({ row }) => <CaseTitle g={row.original} />,
      },
      {
        id: 'department',
        title: t('inbox.column.department'),
        header: t('inbox.column.department'),
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <DepartmentBadge department={row.original.category} size="sm" />
            <p className="text-muted-foreground max-w-40 truncate text-xs">
              {[row.original.routing.sub_department?.replace(/_/g, ' '), row.original.location.ward_name]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        ),
      },
      {
        id: 'sla',
        title: t('inbox.column.sla'),
        header: t('inbox.column.sla'),
        cell: ({ row }) => <SLACountdownGov grievance={row.original} />,
      },
      {
        id: 'support',
        title: t('inbox.column.support'),
        header: () => (
          <>
            <Users className="size-3.5" aria-hidden />
            <span className="sr-only">{t('inbox.column.support')}</span>
          </>
        ),
        cell: ({ row }) => (
          <span className="tabular text-muted-foreground font-mono text-xs">
            {row.original.support_count > 0 ? fmt.number(row.original.support_count) : '–'}
          </span>
        ),
      },
      {
        id: 'status',
        title: t('inbox.column.status'),
        header: t('inbox.column.status'),
        cell: ({ row }) => <GovStatusChip status={row.original.status} />,
      },
      {
        id: 'escalation',
        title: t('inbox.column.escalation'),
        header: t('inbox.column.escalation'),
        cell: ({ row }) => <EscalationDots level={row.original.escalation_level} />,
      },
    ],
    [t, fmt],
  );

  // Selection only makes sense for rows on screen, so it drops when the view changes.
  const viewKey = JSON.stringify(data.query);
  useEffect(() => setSelection({}), [viewKey]);
  const selected = data.items.filter((g) => selection[g.id]);
  const lastPage = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <PageTransition className="space-y-3">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-xl font-semibold tracking-tight md:text-2xl">{t('nav.inbox')}</h1>
      </header>

      <SummaryStrip
        filters={filters}
        onSelect={(f) => setFilters({ ...Object.fromEntries(FILTER_KEYS.map((k) => [k, ''])), ...f })}
      />

      <InboxTabs />

      <FilterBar searchPlaceholder={t('inbox.search')} />

      {data.isPending ? (
        <ListSkeleton rows={4} />
      ) : data.isError ? (
        <ErrorState error={data.error} onRetry={() => data.refetch()} />
      ) : data.items.length === 0 ? (
        <GovEmpty
          title={activeCount ? t('inbox.empty_filtered') : t('inbox.empty')}
          description={activeCount ? t('inbox.empty_filtered_hint') : t('inbox.empty_hint')}
          action={
            activeCount ? (
              <Button variant="outline" className="touch-target" onClick={clear}>
                {t('filters.clear', { count: activeCount })}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <DataTable
            data={data.items}
            columns={columns}
            getRowId={getRowId}
            label={t('nav.inbox')}
            selection={selection}
            onSelectionChange={setSelection}
            freshIds={fresh}
            onRowOpen={(g) => navigate(`/officer/case/${g.id}`)}
            toolbar={
              selected.length > 0 ? (
                <BulkBar selected={selected} onClear={() => setSelection({})} />
              ) : (
                <div className="flex items-center gap-2">
                  <ExportMenu
                    sheets={[
                      {
                        name: t('nav.inbox'),
                        columns: [
                          t('audit.ticket'),
                          t('inbox.column.case'),
                          t('inbox.column.priority'),
                          t('inbox.column.department'),
                          t('inbox.column.status'),
                          t('case.due'),
                        ],
                        rows: data.items.map((g) => [
                          g.id,
                          g.title.en,
                          g.priority_score,
                          g.category,
                          g.status,
                          g.sla.due_at,
                        ]),
                      },
                    ]}
                    filename="inbox"
                    title={t('nav.inbox')}
                  />
                  <span className="text-muted-foreground tabular text-xs" data-testid="inbox-count">
                    {t('inbox.count', { count: data.total })}
                  </span>
                  <Select value={sort} onValueChange={(v) => setParam('sort', v === 'priority' ? '' : v)}>
                    <SelectTrigger
                      size="sm"
                      aria-label={t('inbox.sort.label')}
                      className="min-h-11 min-w-11 md:min-h-9 md:min-w-0"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="priority">{t('inbox.sort.priority')}</SelectItem>
                      <SelectItem value="sla">{t('inbox.sort.sla')}</SelectItem>
                      <SelectItem value="newest">{t('inbox.sort.newest')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )
            }
            renderCard={(g, { selected: isSelected, toggle }) => (
              <CaseCard g={g} selected={isSelected} onToggle={toggle} selectable />
            )}
          />
          {data.paged && lastPage > 1 && (
            <nav aria-label={t('table.pagination')} className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="icon"
                className="min-h-11 min-w-11 md:min-h-9 md:min-w-9"
                disabled={page <= 1}
                aria-label={t('table.previous')}
                onClick={() => setParam('page', page > 2 ? String(page - 1) : '')}
              >
                <ChevronLeft className="rtl-flip size-4" aria-hidden />
              </Button>
              <span className="tabular text-sm">{t('table.page', { page, total: lastPage })}</span>
              <Button
                variant="outline"
                size="icon"
                className="min-h-11 min-w-11 md:min-h-9 md:min-w-9"
                disabled={page >= lastPage}
                aria-label={t('table.next')}
                onClick={() => setParam('page', String(page + 1))}
              >
                <ChevronRight className="rtl-flip size-4" aria-hidden />
              </Button>
            </nav>
          )}
        </>
      )}
    </PageTransition>
  );
}
