// Analytics (Spec C §6.5): trends with spike annotations, breakdowns, delay risk, historical ETA by category.
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
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DepartmentId } from '@contracts/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/design/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/design/ui/toggle-group';
import {
  DEPARTMENT_ICONS,
  ErrorState,
  PageTransition,
  PriorityChip,
  TextSkeleton,
} from '@/design/components';
import { api, qk } from '@/lib/api/endpoints';
import { useLangFormat } from '@/lib/i18n/useLangFormat';
import { ChartCard } from '@/portals/gov-shared/components/ChartCard';
import { DaysSelector, useDays } from '@/portals/gov-shared/components/DaysSelector';
import { ExportMenu } from '@/portals/gov-shared/components/ExportMenu';
import { Panel } from '@/portals/gov-shared/components/Panel';
import { SLACountdownGov } from '@/portals/gov-shared/components/SLACountdownGov';
import {
  axisTick,
  CHART_ANIMATION_MS,
  CHART_FOLLOW_MS,
  deptColor,
  tooltipStyle,
} from '@/portals/gov-shared/lib/chart';

const DEPARTMENTS = Object.keys(DEPARTMENT_ICONS) as DepartmentId[];
type By = 'ward' | 'zone' | 'category';
const BY: By[] = ['zone', 'ward', 'category'];
const RISK_WINDOW = { sort: 'sla', page_size: 100 } as const;

export default function Analytics() {
  const { t } = useTranslation('gov');
  const { t: tc } = useTranslation('common');
  const fmt = useLangFormat();
  const days = useDays();
  const [group, setGroup] = useState<'day' | 'week'>('day');
  const [by, setBy] = useState<By>('zone');
  const trends = useQuery({
    queryKey: qk.admin.trends({ days, group }),
    queryFn: ({ signal }) => api.trends({ days, group }, signal),
  });
  const alerts = useQuery({ queryKey: qk.admin.alerts, queryFn: ({ signal }) => api.alerts(signal) });
  const breakdown = useQuery({
    queryKey: qk.admin.breakdown({ by, days }),
    queryFn: ({ signal }) => api.breakdown({ by, days }, signal),
  });
  const categories = useQuery({
    queryKey: qk.admin.breakdown({ by: 'category', days }),
    queryFn: ({ signal }) => api.breakdown({ by: 'category', days }, signal),
  });
  const risk = useQuery({
    queryKey: qk.officer.inbox(RISK_WINDOW),
    queryFn: ({ signal }) => api.officerInbox(RISK_WINDOW, signal),
  });
  const series = useMemo(() => trends.data ?? [], [trends.data]);
  const stacked = useMemo(() => series.map((p) => ({ date: p.date, ...p.by_category })), [series]);
  const present = DEPARTMENTS.filter((d) => series.some((p) => p.by_category?.[d]));
  // A spike marks the nearest plotted bucket on or before it, which also covers the weekly view.
  const spikes = useMemo(() => {
    const dates = series.map((p) => p.date);
    const marks = (alerts.data ?? [])
      .filter((a) => a.kind === 'spike')
      .map((a) => dates.findLast((d) => d <= a.created_at.slice(0, 10)))
      .filter((d): d is string => !!d);
    return [...new Set(marks)];
  }, [alerts.data, series]);
  const delayed = (risk.data?.items ?? []).filter((g) => g.sla.delay_risk === 'high').slice(0, 10);
  const rows = breakdown.data ?? [];
  const eta = [...(categories.data ?? [])].sort((a, b) => b.avg_resolution_hours - a.avg_resolution_hours);
  const trendState = {
    isLoading: trends.isPending,
    error: trends.error,
    onRetry: () => trends.refetch(),
    isEmpty: series.length === 0,
  };
  return (
    <PageTransition className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-xl font-semibold tracking-tight md:text-2xl">
          {t('nav.analytics')}
        </h1>
        <div className="flex items-center gap-2">
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={group}
            aria-label={t('analytics.grouping')}
            onValueChange={(v) => v && setGroup(v as 'day' | 'week')}
          >
            {(['day', 'week'] as const).map((g) => (
              <ToggleGroupItem
                key={g}
                value={g}
                className="data-[state=on]:bg-primary/15 data-[state=on]:text-primary min-h-11 min-w-11 md:min-h-8"
              >
                {t(`analytics.${g}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <DaysSelector />
          <ExportMenu
            sheets={[
              {
                name: t(`analytics.by.${by}`),
                columns: [
                  t(`analytics.by.${by}`),
                  t('kpi.total'),
                  t('kpi.open'),
                  t('kpi.overdue'),
                  t('departments.avg_resolution'),
                ],
                rows: rows.map((r) => [r.label, r.total, r.open, r.overdue, r.avg_resolution_hours]),
              },
              {
                name: t('kpi.trend_title'),
                columns: [t('kpi.date'), t('kpi.created'), t('kpi.resolved')],
                rows: series.map((p) => [p.date, p.created, p.resolved]),
              },
            ]}
            filename={`analytics-${by}-${days}d`}
            title={t('nav.analytics')}
            disabled={rows.length === 0}
          />
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          {...trendState}
          title={t('kpi.trend_title')}
          unit={t(`analytics.per_${group}`)}
          formula={t('analytics.trend_formula')}
          table={{
            columns: [t('kpi.date'), t('kpi.created'), t('kpi.resolved')],
            rows: series.map((p) => [p.date, p.created, p.resolved]),
          }}
        >
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={series} margin={{ top: 16, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" tick={axisTick} tickLine={false} minTickGap={32} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area
                dataKey="created"
                name={t('kpi.created')}
                stroke="var(--primary)"
                fill="var(--primary)"
                fillOpacity={0.15}
                animationDuration={CHART_ANIMATION_MS}
              />
              <Area
                dataKey="resolved"
                name={t('kpi.resolved')}
                stroke="var(--accent)"
                fill="var(--accent)"
                fillOpacity={0.15}
                animationDuration={CHART_ANIMATION_MS}
              />
              {spikes.map((d) => (
                <ReferenceLine
                  key={d}
                  x={d}
                  stroke="var(--danger)"
                  strokeDasharray="4 4"
                  label={{
                    value: t('analytics.spike'),
                    fill: 'var(--danger)',
                    fontSize: 11,
                    position: 'insideTopRight',
                  }}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard
          {...trendState}
          title={t('analytics.by_category')}
          unit={t(`analytics.per_${group}`)}
          formula={t('analytics.category_formula')}
          table={{
            columns: [t('kpi.date'), ...present.map((d) => tc(`departments.${d}`))],
            rows: series.map((p) => [p.date, ...present.map((d) => p.by_category?.[d] ?? 0)]),
          }}
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stacked} margin={{ top: 16, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" tick={axisTick} tickLine={false} minTickGap={32} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: 'var(--surface-2)' }} contentStyle={tooltipStyle} />
              {present.map((d) => (
                <Bar
                  key={d}
                  dataKey={d}
                  stackId="c"
                  name={tc(`departments.${d}`)}
                  fill={deptColor(d)}
                  animationBegin={CHART_FOLLOW_MS}
                  animationDuration={CHART_ANIMATION_MS}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <Tabs value={by} onValueChange={(v) => setBy(v as By)}>
        <TabsList>
          {BY.map((b) => (
            <TabsTrigger key={b} value={b} className="min-h-11 md:min-h-8" data-testid={`by-${b}`}>
              {t(`analytics.by.${b}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        {BY.map((b) => (
          <TabsContent key={b} value={b}>
            {b === by && (
              <ChartCard
                title={t(`analytics.by.${by}`)}
                unit={t('departments.cases')}
                formula={t('analytics.breakdown_formula')}
                isLoading={breakdown.isPending}
                error={breakdown.error}
                onRetry={() => breakdown.refetch()}
                isEmpty={rows.length === 0}
                height={300}
                table={{
                  columns: [
                    t(`analytics.by.${by}`),
                    t('kpi.total'),
                    t('kpi.open'),
                    t('kpi.overdue'),
                    t('departments.avg_resolution'),
                  ],
                  rows: rows.map((r) => [r.label, r.total, r.open, r.overdue, r.avg_resolution_hours]),
                }}
              >
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={rows.slice(0, 15)} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" tick={axisTick} tickLine={false} minTickGap={8} />
                    <YAxis tick={axisTick} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: 'var(--surface-2)' }} contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar
                      dataKey="open"
                      name={t('kpi.open')}
                      fill="var(--accent)"
                      animationDuration={CHART_ANIMATION_MS}
                    />
                    <Bar
                      dataKey="overdue"
                      name={t('kpi.overdue')}
                      fill="var(--danger)"
                      animationDuration={CHART_ANIMATION_MS}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t('analytics.delay_risk')}>
          {risk.isPending ? (
            <TextSkeleton lines={4} />
          ) : risk.isError ? (
            <ErrorState compact error={risk.error} onRetry={() => risk.refetch()} />
          ) : delayed.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('analytics.no_delay_risk')}</p>
          ) : (
            <ul className="divide-y" data-testid="delay-risk">
              {delayed.map((g) => (
                <li key={g.id} className="flex items-center gap-2 py-1.5 text-sm">
                  <PriorityChip priority={g.priority} size="sm" />
                  <Link to={`/officer/case/${g.id}`} className="hover:text-primary min-w-0 flex-1 truncate">
                    {g.title.en}
                  </Link>
                  <SLACountdownGov grievance={g} className="shrink-0" />
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title={t('analytics.eta')}>
          <p className="text-muted-foreground text-xs">{t('analytics.eta_label')}</p>
          {categories.isPending ? (
            <TextSkeleton lines={4} />
          ) : categories.isError ? (
            <ErrorState compact error={categories.error} onRetry={() => categories.refetch()} />
          ) : (
            <ul className="space-y-1 text-sm">
              {eta.map((r) => (
                <li key={r.key} className="flex justify-between gap-2">
                  <span>{r.label}</span>
                  <span className="tabular font-mono text-xs">{fmt.number(r.avg_resolution_hours)} h</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </PageTransition>
  );
}
