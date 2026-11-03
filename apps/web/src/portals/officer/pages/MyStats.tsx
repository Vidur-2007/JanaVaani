// Personal stats and SLA streak (Spec C §5.4).
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueries } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Flame } from 'lucide-react';
import type { Status } from '@contracts/types';
import { ErrorState, PageTransition, StatSkeleton } from '@/design/components';
import { api, qk, type InboxQuery } from '@/lib/api/endpoints';
import { useLangFormat } from '@/lib/i18n/useLangFormat';
import { ChartCard } from '@/portals/gov-shared/components/ChartCard';
import { KPIStatGov } from '@/portals/gov-shared/components/KPIStatGov';
import { computeOfficerStats } from '@/portals/gov-shared/lib/officerStats';

// #28 matches one status at a time on the live API, so each finished state is fetched separately.
const finished = (status: Status): InboxQuery => ({ status, sort: 'newest', page_size: 100 });
const STATES: Status[] = ['closed', 'resolved_pending_verification'];

export default function MyStats() {
  const { t } = useTranslation('gov');
  const fmt = useLangFormat();
  const [closed, pending] = useQueries({
    queries: STATES.map((s) => ({
      queryKey: qk.officer.inbox(finished(s)),
      queryFn: ({ signal }: { signal: AbortSignal }) => api.officerInbox(finished(s), signal),
    })),
  });
  const stats = useMemo(
    () =>
      closed.data && pending.data ? computeOfficerStats([...closed.data.items, ...pending.data.items]) : null,
    [closed.data, pending.data],
  );
  const failed = closed.isError ? closed : pending.isError ? pending : null;
  if (failed) return <ErrorState error={failed.error} onRetry={() => failed.refetch()} />;
  return (
    <PageTransition className="space-y-4">
      <h1 className="font-display text-xl font-semibold tracking-tight md:text-2xl">{t('nav.my_stats')}</h1>
      {!stats ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <StatSkeleton key={i} />
          ))}
        </div>
      ) : (
        <>
          <div
            className="border-primary/40 bg-primary/8 flex items-center gap-3 rounded-[var(--radius-lg)] border p-4"
            data-testid="sla-streak"
          >
            <Flame className="text-primary size-8 shrink-0" aria-hidden />
            <p>
              <span className="font-display tabular text-2xl font-semibold">{fmt.number(stats.streak)}</span>
              <span className="text-muted-foreground ms-2 text-sm">
                {t('stats.streak', { count: stats.streak })}
              </span>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KPIStatGov label={t('stats.resolved_week')} value={stats.resolved_7d} />
            <KPIStatGov
              label={t('stats.avg_resolution')}
              value={stats.avg_resolution_hours}
              decimals={1}
              suffix=" h"
            />
            <KPIStatGov label={t('stats.sla')} value={stats.sla_pct} decimals={1} suffix="%" />
            {stats.avg_rating != null ? (
              <KPIStatGov label={t('stats.rating')} value={stats.avg_rating} decimals={1} suffix=" / 5" />
            ) : (
              <KPIStatGov label={t('stats.rating')} value={0} format={() => '–'} />
            )}
          </div>
        </>
      )}
      <ChartCard
        title={t('stats.trend_title')}
        unit={t('stats.trend_unit')}
        formula={t('stats.trend_formula')}
        isLoading={!stats}
        isEmpty={stats?.trend.every((d) => d.resolved === 0)}
        table={{
          columns: [t('kpi.date'), t('kpi.resolved')],
          rows: (stats?.trend ?? []).map((d) => [d.date, d.resolved]),
        }}
      >
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={stats?.trend} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
              tickLine={false}
              minTickGap={32}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: 'var(--surface-2)' }}
              contentStyle={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 8,
              }}
            />
            <Bar
              dataKey="resolved"
              name={t('kpi.resolved')}
              fill="var(--accent)"
              radius={[4, 4, 0, 0]}
              animationDuration={600}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </PageTransition>
  );
}
