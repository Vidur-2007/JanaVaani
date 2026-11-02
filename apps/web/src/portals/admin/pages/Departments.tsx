// Departments (Spec C §6.3): leaderboard, per-department drawer, comparison charts.
// No satisfaction histogram or sub-department endpoint exists (gap G5): charts show averages, and sub-departments
// are counted from the department's open cases.
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DepartmentId, DepartmentPerformance } from '@contracts/types';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/design/ui/sheet';
import { ErrorState, ListSkeleton, PageTransition, TextSkeleton } from '@/design/components';
import { api, qk } from '@/lib/api/endpoints';
import { useLangFormat } from '@/lib/i18n/useLangFormat';
import { ChartCard } from '@/portals/gov-shared/components/ChartCard';
import { DaysSelector, useDays } from '@/portals/gov-shared/components/DaysSelector';
import { DeptLeaderboard, ScoreFormula } from '@/portals/gov-shared/components/DeptLeaderboard';
import { ExportMenu } from '@/portals/gov-shared/components/ExportMenu';
import { Panel } from '@/portals/gov-shared/components/Panel';
import { SLACountdownGov } from '@/portals/gov-shared/components/SLACountdownGov';
import { axisTick, CHART_ANIMATION_MS, deptColor, tooltipStyle } from '@/portals/gov-shared/lib/chart';

const MEDIUM_SLA_HOURS = 96;

function PerDeptBar({
  rows,
  dataKey,
  name,
  reference,
}: {
  rows: (DepartmentPerformance & { name: string })[];
  dataKey: keyof DepartmentPerformance;
  name: string;
  reference?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(240, rows.length * 26)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--border)" horizontal={false} />
        <XAxis type="number" tick={axisTick} tickLine={false} />
        <YAxis type="category" dataKey="name" width={96} tick={axisTick} tickLine={false} axisLine={false} interval={0} />
        <Tooltip cursor={{ fill: 'var(--surface-2)' }} contentStyle={tooltipStyle} />
        {reference != null && <ReferenceLine x={reference} stroke="var(--warning)" strokeDasharray="4 4" />}
        <Bar dataKey={dataKey} name={name} radius={[0, 4, 4, 0]} animationDuration={CHART_ANIMATION_MS}>
          {rows.map((r) => (
            <Cell key={r.department_id} fill={deptColor(r.department_id)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function DepartmentDrawer({ id, days, onClose }: { id: DepartmentId; days: number; onClose: () => void }) {
  const { t } = useTranslation('gov');
  const { t: tc } = useTranslation('common');
  const fmt = useLangFormat();
  const trends = useQuery({
    queryKey: qk.admin.trends({ days }),
    queryFn: ({ signal }) => api.trends({ days }, signal),
  });
  const workload = useQuery({
    queryKey: qk.admin.workload(id),
    queryFn: ({ signal }) => api.officerWorkload({ department: id }, signal),
  });
  const open = useQuery({
    queryKey: qk.officer.inbox({ category: id, page_size: 100 }),
    queryFn: ({ signal }) => api.officerInbox({ category: id, page_size: 100 }, signal),
  });
  const series = (trends.data ?? []).map((p) => ({ date: p.date, count: p.by_category?.[id] ?? 0 }));
  const subs = useMemo(() => {
    const counts = new Map<string, number>();
    open.data?.items.forEach((g) => {
      const s = g.routing.sub_department ?? t('departments.unspecified');
      counts.set(s, (counts.get(s) ?? 0) + 1);
    });
    return [...counts].sort((a, b) => b[1] - a[1]);
  }, [open.data, t]);
  const overdue = open.data?.items.filter((g) => g.sla.breached).slice(0, 8) ?? [];
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full space-y-3 overflow-y-auto p-4 sm:max-w-lg" data-testid="department-drawer">
        <SheetHeader className="p-0">
          <SheetTitle>{tc(`departments.${id}`)}</SheetTitle>
          <SheetDescription>{t('departments.drawer_hint', { count: days })}</SheetDescription>
        </SheetHeader>
        <Panel title={t('kpi.trend_title')}>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
              <XAxis dataKey="date" tick={axisTick} tickLine={false} minTickGap={40} />
              <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area
                dataKey="count"
                name={t('kpi.created')}
                stroke={deptColor(id)}
                fill={deptColor(id)}
                fillOpacity={0.2}
                animationDuration={CHART_ANIMATION_MS}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title={t('departments.sub_departments')}>
          {open.isPending ? (
            <TextSkeleton lines={3} />
          ) : (
            <ul className="space-y-1 text-sm">
              {subs.map(([s, n]) => (
                <li key={s} className="flex justify-between gap-2">
                  <span>{s.replace(/_/g, ' ')}</span>
                  <span className="tabular font-mono text-xs">{fmt.number(n)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title={t('nav.officers')}>
          {workload.isPending ? (
            <TextSkeleton lines={3} />
          ) : (
            <ul className="space-y-1 text-sm">
              {workload.data?.map((w) => (
                <li key={w.officer.id} className="flex justify-between gap-2">
                  <span className="truncate">{w.officer.name}</span>
                  <span className="text-muted-foreground tabular shrink-0 text-xs">
                    {t('bulk.open_cases', { count: w.open })} · {t('officers.overdue_count', { count: w.overdue })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title={t('kpi.overdue')}>
          {overdue.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('departments.none_overdue')}</p>
          ) : (
            <ul className="space-y-1.5">
              {overdue.map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link to={`/officer/case/${g.id}`} className="hover:text-primary truncate">
                    {g.title.en}
                  </Link>
                  <SLACountdownGov grievance={g} className="shrink-0" />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </SheetContent>
    </Sheet>
  );
}

export default function Departments() {
  const { t } = useTranslation('gov');
  const { t: tc } = useTranslation('common');
  const days = useDays();
  const [open, setOpen] = useState<DepartmentId | null>(null);
  const q = useQuery({
    queryKey: qk.admin.performance(days),
    queryFn: ({ signal }) => api.departmentPerformance({ days }, signal),
  });
  const rows = useMemo(
    () => (q.data ?? []).map((d) => ({ ...d, name: tc(`departments.${d.department_id}`) })),
    [q.data, tc],
  );
  const sorted = (key: keyof DepartmentPerformance) =>
    [...rows].sort((a, b) => Number(b[key]) - Number(a[key]));
  const table = (key: keyof DepartmentPerformance) => ({
    columns: [t('inbox.column.department'), t('admin.value')],
    rows: sorted(key).map((r) => [r.name, Number(r[key])]),
  });
  const sheets = [
    {
      name: t('nav.departments'),
      columns: ['#', t('inbox.column.department'), t('departments.score'), t('departments.sla'), t('departments.avg_resolution'), t('departments.satisfaction'), t('departments.reopen'), t('kpi.open'), t('kpi.overdue')],
      rows: sorted('score').map((d) => [d.rank, d.name, d.score, d.sla_compliance_pct, d.avg_resolution_hours, d.satisfaction_avg, d.reopen_rate, d.open, d.overdue]),
    },
  ];
  const shared = { isLoading: q.isPending, error: q.error, onRetry: () => q.refetch(), isEmpty: rows.length === 0 };
  return (
    <PageTransition className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-xl font-semibold tracking-tight md:text-2xl">{t('nav.departments')}</h1>
        <div className="flex items-center gap-2">
          <DaysSelector />
          <ExportMenu
            sheets={sheets}
            filename={`departments-${days}d`}
            title={t('nav.departments')}
            disabled={rows.length === 0}
          />
        </div>
      </header>
      <Panel title={t('admin.leaderboard')} action={<ScoreFormula />}>
        {q.isPending ? (
          <ListSkeleton rows={3} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : (
          <DeptLeaderboard rows={q.data} onSelect={setOpen} />
        )}
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard {...shared} title={t('departments.chart_sla')} unit="%" formula={t('departments.formula_sla')} table={table('sla_compliance_pct')}>
          <PerDeptBar rows={sorted('sla_compliance_pct')} dataKey="sla_compliance_pct" name={t('departments.sla')} />
        </ChartCard>
        <ChartCard {...shared} title={t('departments.chart_resolution')} unit={t('departments.hours')} formula={t('departments.formula_resolution')} table={table('avg_resolution_hours')}>
          <PerDeptBar rows={sorted('avg_resolution_hours')} dataKey="avg_resolution_hours" name={t('departments.avg_resolution')} reference={MEDIUM_SLA_HOURS} />
        </ChartCard>
        <ChartCard {...shared} title={t('departments.chart_satisfaction')} unit={t('departments.out_of_five')} formula={t('departments.formula_satisfaction')} table={table('satisfaction_avg')}>
          <PerDeptBar rows={sorted('satisfaction_avg')} dataKey="satisfaction_avg" name={t('departments.satisfaction')} />
        </ChartCard>
        <ChartCard {...shared} title={t('departments.chart_overdue')} unit={t('departments.cases')} formula={t('departments.formula_overdue')} table={table('overdue')}>
          <PerDeptBar rows={sorted('overdue')} dataKey="overdue" name={t('kpi.overdue')} />
        </ChartCard>
      </div>
      {open && <DepartmentDrawer id={open} days={days} onClose={() => setOpen(null)} />}
    </PageTransition>
  );
}
