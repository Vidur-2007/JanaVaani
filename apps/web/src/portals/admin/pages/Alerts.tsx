// Alerts (Spec C §6.6). `Alert` carries no spike series (gap G6), so the mini-chart uses the category's citywide daily
// counts from #46: 28-day baseline against the latest day.
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Alert, TrendPoint } from '@contracts/types';
import { ToggleGroup, ToggleGroupItem } from '@/design/ui/toggle-group';
import { ErrorState, ListSkeleton, PageTransition } from '@/design/components';
import { api, qk } from '@/lib/api/endpoints';
import { useLangFormat } from '@/lib/i18n/useLangFormat';
import { AlertCard, alertTarget } from '@/portals/gov-shared/components/AlertCard';
import { GovEmpty } from '@/portals/gov-shared/components/GovEmpty';
import { useAcknowledged } from '@/portals/gov-shared/hooks/useAcknowledged';
import { useFreshIds } from '@/portals/gov-shared/hooks/useFreshIds';
import { axisTick, CHART_ANIMATION_MS, tooltipStyle } from '@/portals/gov-shared/lib/chart';

const SEVERITIES = ['all', 'critical', 'warning', 'info'] as const;
type Severity = (typeof SEVERITIES)[number];
const BASELINE_DAYS = 28;
const EXAMPLES = 3;
const DAYS = { days: BASELINE_DAYS + 1 };

function SpikeDetail({ alert, trends }: { alert: Alert; trends?: TrendPoint[] }) {
  const { t } = useTranslation('gov');
  const fmt = useLangFormat();
  const examples = useQueries({
    queries: alert.grievance_ids.slice(0, EXAMPLES).map((id) => ({
      queryKey: qk.grievances.detail(id),
      queryFn: ({ signal }: { signal: AbortSignal }) => api.getGrievance(id, {}, signal),
    })),
  });
  const series = (trends ?? []).map((p) => ({
    date: p.date,
    count: alert.category ? (p.by_category?.[alert.category] ?? 0) : p.created,
  }));
  const today = series.at(-1)?.count ?? 0;
  const prior = series.slice(0, -1);
  const baseline = prior.length ? prior.reduce((a, p) => a + p.count, 0) / prior.length : 0;
  return (
    <div className="bg-surface-2/50 mt-1 space-y-2 rounded-[var(--radius-sm)] p-3" data-testid="spike-detail">
      <p className="text-xs">
        <span className="font-medium">{t('alerts.today', { count: today })}</span>
        <span className="text-muted-foreground">
          {' '}
          · {t('alerts.baseline', { value: fmt.number(+baseline.toFixed(1)) })}
        </span>
      </p>
      <ResponsiveContainer width="100%" height={96}>
        <BarChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
          <XAxis dataKey="date" tick={false} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: 'var(--surface-2)' }} contentStyle={tooltipStyle} />
          <ReferenceLine y={baseline} stroke="var(--warning)" strokeDasharray="4 4" />
          <Bar dataKey="count" name={t('kpi.created')} animationDuration={CHART_ANIMATION_MS}>
            {series.map((p, i) => (
              <Cell key={p.date} fill={i === series.length - 1 ? 'var(--danger)' : 'var(--accent)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div>
        <h4 className="text-muted-foreground text-xs font-medium">{t('alerts.examples')}</h4>
        <ul className="mt-1 space-y-1">
          {examples.flatMap((e) =>
            e.data
              ? [
                  <li key={e.data.id} className="text-sm" lang={e.data.title.lang} dir="auto">
                    <Link to={`/officer/case/${e.data.id}`} className="hover:text-primary">
                      {e.data.title.original}
                    </Link>
                  </li>,
                ]
              : [],
          )}
        </ul>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Link to={alertTarget(alert)} className="text-signal text-xs font-medium hover:underline">
          {t('alerts.open_incident')}
        </Link>
        {/* S1: every spike can be worked as a war room (Surge Mode when it qualifies). */}
        <Link
          to={`/admin/surge/${encodeURIComponent(alert.id)}`}
          className="text-danger text-xs font-medium hover:underline"
          data-testid="alert-war-room"
        >
          {t('surge.open_war_room')}
        </Link>
      </div>
    </div>
  );
}

export default function Alerts() {
  const { t } = useTranslation('gov');
  const [severity, setSeverity] = useState<Severity>('all');
  const { acknowledged, acknowledge } = useAcknowledged();
  const q = useQuery({ queryKey: qk.admin.alerts, queryFn: ({ signal }) => api.alerts(signal) });
  const trends = useQuery({
    queryKey: qk.admin.trends(DAYS),
    queryFn: ({ signal }) => api.trends(DAYS, signal),
    enabled: !!q.data?.some((a) => a.kind === 'spike'),
  });
  const list = useMemo(
    () => (q.data ?? []).filter((a) => severity === 'all' || a.severity === severity),
    [q.data, severity],
  );
  const fresh = useFreshIds(
    (q.data ?? []).map((a) => a.id),
    'alerts',
    !q.isPending,
  );
  const count = (s: Severity) => (q.data ?? []).filter((a) => s === 'all' || a.severity === s).length;
  return (
    <PageTransition className="space-y-3">
      <h1 className="font-display text-xl font-semibold tracking-tight md:text-2xl">{t('nav.alerts')}</h1>
      <ToggleGroup
        type="single"
        size="sm"
        variant="outline"
        value={severity}
        aria-label={t('alerts.severity')}
        onValueChange={(v) => v && setSeverity(v as Severity)}
        className="flex-wrap justify-start"
      >
        {SEVERITIES.map((s) => (
          <ToggleGroupItem
            key={s}
            value={s}
            data-testid={`severity-${s}`}
            className="data-[state=on]:bg-primary/15 data-[state=on]:text-primary min-h-11 md:min-h-8"
          >
            {t(`alerts.level.${s}`)} ({count(s)})
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {q.isPending ? (
        <ListSkeleton rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : list.length === 0 ? (
        <GovEmpty title={t('admin.no_alerts')} />
      ) : (
        <div className="grid items-start gap-3 lg:grid-cols-2">
          {list.map((a, i) => (
            <div key={a.id}>
              <AlertCard
                alert={a}
                index={i}
                fresh={fresh.has(a.id)}
                acknowledged={acknowledged.includes(a.id)}
                onAcknowledge={() => acknowledge(a.id)}
              />
              {a.kind === 'spike' && <SpikeDetail alert={a} trends={trends.data} />}
            </div>
          ))}
        </div>
      )}
    </PageTransition>
  );
}
