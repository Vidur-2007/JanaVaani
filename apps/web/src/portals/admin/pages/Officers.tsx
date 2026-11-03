// Officers (Spec C §6.4): workload table, load chart, overload highlight (≥ 1.5× department median).
// OfficerWorkload has no open-by-priority split (gap G4), so bars stack critical against other open.
import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Users } from 'lucide-react';
import type { OfficerWorkload } from '@contracts/types';
import { DepartmentBadge, EmptyState, ErrorState, ListSkeleton, PageTransition } from '@/design/components';
import { api, qk } from '@/lib/api/endpoints';
import { useLangFormat } from '@/lib/i18n/useLangFormat';
import { cn } from '@/lib/utils';
import { ChartCard } from '@/portals/gov-shared/components/ChartCard';
import { DataTable, type DataColumn } from '@/portals/gov-shared/components/DataTable';
import { ExportMenu } from '@/portals/gov-shared/components/ExportMenu';
import { axisTick, CHART_ANIMATION_MS, median, tooltipStyle } from '@/portals/gov-shared/lib/chart';

const OVERLOAD_RATIO = 1.5;
type Row = OfficerWorkload & { overloaded: boolean };
const rowId = (r: Row) => r.officer.id;

export default function Officers() {
  const { t } = useTranslation('gov');
  const fmt = useLangFormat();
  const tableArea = useRef<HTMLDivElement>(null);
  const q = useQuery({
    queryKey: qk.admin.workload(),
    queryFn: ({ signal }) => api.officerWorkload({}, signal),
  });
  const rows = useMemo<Row[]>(() => {
    const data = q.data ?? [];
    const medians = new Map<string, number>();
    for (const d of new Set(data.map((w) => w.officer.department_id))) {
      medians.set(d, median(data.filter((w) => w.officer.department_id === d).map((w) => w.open)));
    }
    return data
      .map((w) => {
        const m = medians.get(w.officer.department_id) ?? 0;
        return { ...w, overloaded: m > 0 && w.open >= OVERLOAD_RATIO * m };
      })
      .sort((a, b) => b.open - a.open);
  }, [q.data]);
  const columns = useMemo<DataColumn<Row>[]>(
    () => [
      {
        id: 'officer',
        header: t('officers.officer'),
        cell: ({ row: { original: r } }) => (
          <div>
            <p className="font-medium">
              {r.officer.name}
              {r.overloaded && (
                <span
                  data-testid="overloaded"
                  className="bg-surface text-warning border-warning/50 ms-2 rounded-full border px-1.5 py-0.5 text-[11px] font-medium"
                >
                  {t('officers.overloaded')}
                </span>
              )}
            </p>
            <p className="text-muted-foreground text-xs">{r.officer.designation}</p>
          </div>
        ),
      },
      {
        id: 'department',
        title: t('inbox.column.department'),
        header: t('inbox.column.department'),
        cell: ({ row }) => <DepartmentBadge department={row.original.officer.department_id} size="sm" />,
      },
      ...(['open', 'critical', 'overdue', 'resolved_7d'] as const).map((k): DataColumn<Row> => ({
        id: k,
        title: t(`officers.${k}`),
        header: t(`officers.${k}`),
        cell: ({ row }) => <span className="tabular font-mono">{fmt.number(row.original[k])}</span>,
      })),
    ],
    [t, fmt],
  );
  const sheets = [
    {
      name: t('nav.officers'),
      columns: [
        t('officers.officer'),
        t('inbox.column.department'),
        t('officers.open'),
        t('officers.critical'),
        t('officers.overdue'),
        t('officers.resolved_7d'),
      ],
      rows: rows.map((r) => [
        r.officer.name,
        r.officer.department_id,
        r.open,
        r.critical,
        r.overdue,
        r.resolved_7d,
      ]),
    },
  ];
  const chart = rows.slice(0, 12).map((r) => ({
    name: r.officer.name,
    critical: r.critical,
    other: Math.max(0, r.open - r.critical),
  }));
  return (
    <PageTransition className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-xl font-semibold tracking-tight md:text-2xl">{t('nav.officers')}</h1>
        <ExportMenu
          sheets={sheets}
          filename="officer-workload"
          title={t('nav.officers')}
          target={tableArea}
          disabled={rows.length === 0}
        />
      </header>
      {q.isPending ? (
        <ListSkeleton rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Users} title={t('officers.empty')} />
      ) : (
        <>
          <ChartCard
            title={t('officers.chart_title')}
            unit={t('officers.chart_unit')}
            formula={t('officers.chart_formula')}
            table={{
              columns: [t('officers.officer'), t('officers.critical'), t('officers.other_open')],
              rows: chart.map((c) => [c.name, c.critical, c.other]),
            }}
          >
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={axisTick} tickLine={false} minTickGap={8} />
                <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: 'var(--surface-2)' }} contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  dataKey="critical"
                  stackId="load"
                  name={t('officers.critical')}
                  fill="var(--prio-critical)"
                  animationDuration={CHART_ANIMATION_MS}
                />
                <Bar
                  dataKey="other"
                  stackId="load"
                  name={t('officers.other_open')}
                  fill="var(--accent)"
                  radius={[4, 4, 0, 0]}
                  animationDuration={CHART_ANIMATION_MS}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <div ref={tableArea}>
            <DataTable
              data={rows}
              columns={columns}
              getRowId={rowId}
              label={t('nav.officers')}
              maxHeight="min(70dvh, 640px)"
              rowClassName={(r) => cn(r.overloaded && 'bg-warning/8')}
              renderCard={(r) => (
                <article
                  className={cn(
                    'bg-surface space-y-1 rounded-[var(--radius-md)] border p-3',
                    r.overloaded && 'border-warning/50',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{r.officer.name}</p>
                    <DepartmentBadge department={r.officer.department_id} size="sm" iconOnly />
                  </div>
                  <p className="text-muted-foreground tabular text-xs">
                    {t('bulk.open_cases', { count: r.open })} ·{' '}
                    {t('officers.overdue_count', { count: r.overdue })}
                  </p>
                  {r.overloaded && (
                    <p data-testid="overloaded" className="text-warning text-xs font-medium">
                      {t('officers.overloaded')}
                    </p>
                  )}
                </article>
              )}
            />
          </div>
        </>
      )}
    </PageTransition>
  );
}
