// Interim command center: exercises the P1 gov components until the full page lands in P3 (Spec C §6.1).
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ErrorState, ListSkeleton, PageTransition, StatSkeleton } from '@/design/components';
import { api, qk } from '@/lib/api/endpoints';
import { useLangFormat } from '@/lib/i18n/useLangFormat';
import { AlertCard } from '@/portals/gov-shared/components/AlertCard';
import { ChartCard } from '@/portals/gov-shared/components/ChartCard';
import { GovMap } from '@/portals/gov-shared/components/GovMap';
import { KPIStatGov } from '@/portals/gov-shared/components/KPIStatGov';

export default function CommandCenterStub() {
  const { t } = useTranslation('gov');
  const fmt = useLangFormat();
  const kpis = useQuery({
    queryKey: qk.admin.kpis(30),
    queryFn: ({ signal }) => api.adminKpis({ days: 30 }, signal),
  });
  const trends = useQuery({
    queryKey: qk.admin.trends({ days: 30 }),
    queryFn: ({ signal }) => api.trends({ days: 30 }, signal),
  });
  const points = useQuery({
    queryKey: qk.admin.map({ days: 30 }),
    queryFn: ({ signal }) => api.adminMap({ days: 30 }, signal),
  });
  const incidents = useQuery({
    queryKey: qk.officer.incidents(),
    queryFn: ({ signal }) => api.incidents({}, signal),
  });
  const alerts = useQuery({ queryKey: qk.admin.alerts, queryFn: ({ signal }) => api.alerts(signal) });
  const created = trends.data?.map((p) => p.created);

  return (
    <PageTransition className="space-y-4">
      <h1 className="font-display text-xl font-semibold tracking-tight md:text-2xl">
        {t('nav.command_center')}
      </h1>
      {kpis.isError ? (
        <ErrorState error={kpis.error} onRetry={() => kpis.refetch()} />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.isPending ? (
            [0, 1, 2, 3].map((i) => <StatSkeleton key={i} />)
          ) : (
            <>
              <KPIStatGov
                label={t('kpi.open')}
                value={kpis.data.open}
                delta={kpis.data.deltas.open}
                upIsGood={false}
                trend={created}
                to="/officer"
              />
              <KPIStatGov
                label={t('kpi.overdue')}
                value={kpis.data.overdue}
                delta={kpis.data.deltas.overdue}
                upIsGood={false}
                to="/officer?overdue=true"
              />
              <KPIStatGov label={t('kpi.critical_open')} value={kpis.data.critical_open} to="/officer?priority=critical" />
              <KPIStatGov label={t('kpi.sla')} value={kpis.data.sla_compliance_pct} decimals={1} suffix="%" />
            </>
          )}
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <GovMap
          points={points.data}
          incidents={incidents.data}
          defaultLayers={['heat', 'wards', 'critical']}
          height="min(60dvh, 520px)"
        />
        <div className="space-y-2 xl:max-h-[520px] xl:overflow-y-auto">
          {alerts.isPending ? (
            <ListSkeleton rows={2} />
          ) : alerts.isError ? (
            <ErrorState compact error={alerts.error} onRetry={() => alerts.refetch()} />
          ) : (
            alerts.data.map((a) => <AlertCard key={a.id} alert={a} />)
          )}
        </div>
      </div>
      <ChartCard
        title={t('kpi.trend_title')}
        unit={t('kpi.trend_unit')}
        formula={t('kpi.trend_formula')}
        isLoading={trends.isPending}
        error={trends.error}
        onRetry={() => trends.refetch()}
        isEmpty={trends.data?.length === 0}
        table={{
          columns: [t('kpi.date'), t('kpi.created'), t('kpi.resolved')],
          rows: (trends.data ?? []).map((p) => [p.date, p.created, p.resolved]),
        }}
      >
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={trends.data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} minTickGap={32} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
            <Tooltip
              formatter={(v) => fmt.number(Number(v))}
              contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8 }}
            />
            <Area
              type="monotone"
              dataKey="created"
              name={t('kpi.created')}
              stroke="var(--primary)"
              fill="var(--primary)"
              fillOpacity={0.15}
              animationDuration={600}
            />
            <Area
              type="monotone"
              dataKey="resolved"
              name={t('kpi.resolved')}
              stroke="var(--accent)"
              fill="var(--accent)"
              fillOpacity={0.15}
              animationDuration={600}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>
    </PageTransition>
  );
}
