// Command Center (Spec C §6.1): the city at a glance. Supervisors get it read-only, so links to admin-only pages hide.
import { useMemo } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, RefreshCw } from 'lucide-react';
import { Button } from '@/design/ui/button';
import {
  AIBadge,
  ErrorState,
  LiveIndicator,
  ListSkeleton,
  PageTransition,
  StatSkeleton,
  TextSkeleton,
} from '@/design/components';
import { api, qk } from '@/lib/api/endpoints';
import { useAuth } from '@/lib/auth/useAuth';
import { AlertCard } from '@/portals/gov-shared/components/AlertCard';
import { DaysSelector, useDays } from '@/portals/gov-shared/components/DaysSelector';
import { DeptLeaderboard, ScoreFormula } from '@/portals/gov-shared/components/DeptLeaderboard';
import { GovMap } from '@/portals/gov-shared/components/GovMap';
import { KPIStatGov } from '@/portals/gov-shared/components/KPIStatGov';
import { useFreshIds } from '@/portals/gov-shared/hooks/useFreshIds';
import { Panel } from '@/portals/gov-shared/components/Panel';

// Outside qk.admin so live events never re-run the LLM; only Regenerate does.
const insightsKey = (days: number) => ['jv-insights', days] as const;

function InsightsCard({ days }: { days: number }) {
  const { t } = useTranslation('gov');
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: insightsKey(days),
    queryFn: ({ signal }) => api.insights({ days }, signal),
    staleTime: Infinity,
  });
  const regenerate = useMutation({
    mutationFn: () => api.insights({ days, refresh: true }),
    onSuccess: (d) => qc.setQueryData(insightsKey(days), d),
  });
  return (
    <Panel
      ai
      title={t('admin.insights')}
      action={
        <span className="flex items-center gap-1">
          {q.data?.numbers_verified && (
            <span
              className="text-success inline-flex items-center gap-1 text-[11px] font-medium"
              data-testid="numbers-verified"
            >
              <BadgeCheck className="size-3.5" aria-hidden />
              {t('admin.numbers_verified')}
            </span>
          )}
          <AIBadge variant="generated" />
          <Button
            variant="ghost"
            size="icon-sm"
            className="min-h-11 min-w-11 md:min-h-8 md:min-w-8"
            aria-label={t('admin.regenerate')}
            disabled={regenerate.isPending}
            onClick={() => regenerate.mutate()}
          >
            <RefreshCw className="size-4" aria-hidden />
          </Button>
        </span>
      }
    >
      {q.isPending ? (
        <TextSkeleton lines={4} />
      ) : q.isError ? (
        <ErrorState compact error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <ul className="list-disc space-y-1 ps-4 text-sm">
          {q.data.bullets_en.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export default function CommandCenter() {
  const { t } = useTranslation('gov');
  const { profile } = useAuth();
  const days = useDays();
  const admin = profile?.role === 'admin';
  const kpis = useQuery({
    queryKey: qk.admin.kpis(days),
    queryFn: ({ signal }) => api.adminKpis({ days }, signal),
  });
  const trends = useQuery({
    queryKey: qk.admin.trends({ days }),
    queryFn: ({ signal }) => api.trends({ days }, signal),
  });
  const points = useQuery({
    queryKey: qk.admin.map({ days }),
    queryFn: ({ signal }) => api.adminMap({ days }, signal),
  });
  const incidents = useQuery({
    queryKey: qk.officer.incidents(),
    queryFn: ({ signal }) => api.incidents({}, signal),
  });
  const wards = useQuery({
    queryKey: qk.admin.breakdown({ by: 'ward', days }),
    queryFn: ({ signal }) => api.breakdown({ by: 'ward', days }, signal),
  });
  const alerts = useQuery({ queryKey: qk.admin.alerts, queryFn: ({ signal }) => api.alerts(signal) });
  const perf = useQuery({
    queryKey: qk.admin.performance(days),
    queryFn: ({ signal }) => api.departmentPerformance({ days }, signal),
  });

  const fresh = useFreshIds(
    (alerts.data ?? []).map((a) => a.id),
    'alerts',
    !alerts.isPending,
  );
  const created = trends.data?.map((p) => p.created);
  const resolved = trends.data?.map((p) => p.resolved);
  const wardValues = useMemo(
    () => Object.fromEntries((wards.data ?? []).map((w) => [w.key, w.open])),
    [wards.data],
  );
  const k = kpis.data;

  return (
    <PageTransition className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-xl font-semibold tracking-tight md:text-2xl">
            {t('nav.command_center')}
          </h1>
          <LiveIndicator />
        </div>
        <DaysSelector />
      </header>

      {kpis.isError ? (
        <ErrorState error={kpis.error} onRetry={() => kpis.refetch()} />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="kpi-grid">
          {!k ? (
            Array.from({ length: 8 }, (_, i) => <StatSkeleton key={i} />)
          ) : (
            <>
              <KPIStatGov label={t('kpi.total')} value={k.total} delta={k.deltas.total} trend={created} />
              <KPIStatGov
                label={t('kpi.open')}
                value={k.open}
                delta={k.deltas.open}
                upIsGood={false}
                to="/officer"
              />
              <KPIStatGov
                label={t('kpi.resolved')}
                value={k.resolved}
                delta={k.deltas.resolved}
                trend={resolved}
                to="/officer?status=closed"
              />
              <KPIStatGov
                label={t('kpi.overdue')}
                value={k.overdue}
                delta={k.deltas.overdue}
                upIsGood={false}
                to="/officer?overdue=true"
              />
              <KPIStatGov
                label={t('kpi.critical_open')}
                value={k.critical_open}
                upIsGood={false}
                to="/officer?priority=critical"
              />
              <KPIStatGov
                label={t('kpi.sla')}
                value={k.sla_compliance_pct}
                delta={k.deltas.sla_compliance_pct}
                decimals={1}
                suffix="%"
              />
              <KPIStatGov
                label={t('kpi.avg_resolution')}
                value={k.avg_resolution_hours}
                delta={k.deltas.avg_resolution_hours}
                upIsGood={false}
                decimals={1}
                suffix=" h"
              />
              <KPIStatGov
                label={t('kpi.satisfaction')}
                value={k.satisfaction_avg}
                decimals={1}
                suffix=" / 5"
              />
            </>
          )}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <GovMap
          points={points.data}
          incidents={incidents.data}
          wardValues={wardValues}
          defaultLayers={['heat', 'critical']}
          height="min(60dvh, 520px)"
        />
        <section aria-label={t('nav.alerts')} className="space-y-2 xl:max-h-[520px] xl:overflow-y-auto">
          {alerts.isPending ? (
            <ListSkeleton rows={2} />
          ) : alerts.isError ? (
            <ErrorState compact error={alerts.error} onRetry={() => alerts.refetch()} />
          ) : alerts.data.length === 0 ? (
            <p className="text-muted-foreground p-4 text-center text-sm">{t('admin.no_alerts')}</p>
          ) : (
            alerts.data.map((a, i) => <AlertCard key={a.id} alert={a} index={i} fresh={fresh.has(a.id)} />)
          )}
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <InsightsCard days={days} />
        <Panel
          title={t('admin.leaderboard')}
          action={
            <span className="flex items-center gap-1">
              <ScoreFormula />
              {admin && (
                <Link
                  to="/admin/departments"
                  className="text-signal min-h-11 content-center text-xs font-medium hover:underline md:min-h-0"
                >
                  {t('admin.see_all')}
                </Link>
              )}
            </span>
          }
        >
          {perf.isPending ? (
            <TextSkeleton lines={5} />
          ) : perf.isError ? (
            <ErrorState compact error={perf.error} onRetry={() => perf.refetch()} />
          ) : (
            <DeptLeaderboard rows={perf.data} limit={5} />
          )}
        </Panel>
      </div>
    </PageTransition>
  );
}
