// Spec C §11 S1: Disaster Surge Mode — the incident war room for one surge alert. Live counts, a map of the affected
// complaints and wards, a team assignment board, and (S2) the root-cause graph. Data: the alert (#49), its member
// grievances via the inbox (#28) with any stragglers fetched one by one (#6), and wards (#21).
import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Siren, UserRound } from 'lucide-react';
import type { Alert, Grievance, MapPoint } from '@contracts/types';
import { Button } from '@/design/ui/button';
import {
  ErrorState,
  LangBadge,
  LiveIndicator,
  ListSkeleton,
  PageTransition,
  PriorityChip,
  StatSkeleton,
} from '@/design/components';
import { api, qk } from '@/lib/api/endpoints';
import { GovEmpty } from '@/portals/gov-shared/components/GovEmpty';
import { GovMap } from '@/portals/gov-shared/components/GovMap';
import { GovStatusChip } from '@/portals/gov-shared/components/GovStatusChip';
import { KPIStatGov } from '@/portals/gov-shared/components/KPIStatGov';
import { Panel } from '@/portals/gov-shared/components/Panel';
import { RootCauseGraph } from '@/portals/gov-shared/components/RootCauseGraph';
import { assignmentBoard, surgeAlerts, surgeCounts } from '@/portals/gov-shared/lib/surge';

const MAX_SINGLE_FETCH = 40;
const WINDOW_H = 48;

/**
 * (B's inbox takes one status only, so we rely on its default: open + pending verification.)
 * Members of the surge: the alert's own grievance ids, plus complaints of the same category (and ward, when the
 * alert names one) created in the 48 h before the alert — the spike's own definition. B's alerts list only a few
 * example ids, so the window is what makes the counts match the alert title.
 */
async function loadMembers(alert: Alert, signal: AbortSignal): Promise<Grievance[]> {
  const page = await api.officerInbox(
    {
      category: alert.category,
      ward: alert.ward_id,
      page_size: 100,
      sort: 'newest',
    },
    signal,
  );
  const until = Date.parse(alert.created_at) + 60 * 60 * 1000;
  const since = until - (WINDOW_H + 1) * 60 * 60 * 1000;
  const found = new Map<string, Grievance>();
  const ids = new Set(alert.grievance_ids);
  for (const g of page.items) {
    const t = Date.parse(g.created_at);
    if (ids.has(g.id) || (t >= since && t <= until)) found.set(g.id, g);
  }
  const missing = alert.grievance_ids.filter((id) => !found.has(id)).slice(0, MAX_SINGLE_FETCH);
  const rest = await Promise.allSettled(missing.map((id) => api.getGrievance(id, {}, signal)));
  for (const r of rest) if (r.status === 'fulfilled') found.set(r.value.id, r.value);
  return [...found.values()].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

export default function WarRoom() {
  const { t } = useTranslation('gov');
  const { alertId = '' } = useParams();
  const alerts = useQuery({ queryKey: qk.admin.alerts, queryFn: ({ signal }) => api.alerts(signal) });
  const alert = alerts.data?.find((a) => a.id === alertId);
  const isSurge = !!alert && surgeAlerts([alert]).length > 0;
  const members = useQuery({
    // Under qk.admin so live events refresh the war room like every other admin view.
    queryKey: ['jv', 'admin', 'surge', alertId, alert?.grievance_ids.length ?? 0] as const,
    queryFn: ({ signal }) => loadMembers(alert!, signal),
    enabled: !!alert,
  });
  const wards = useQuery({
    queryKey: qk.meta.wards,
    queryFn: ({ signal }) => api.wards(signal),
    staleTime: Infinity,
  });

  const list = useMemo(() => members.data ?? [], [members.data]);
  const counts = surgeCounts(list);
  const board = assignmentBoard(list);
  const points: MapPoint[] = list.map((g) => ({
    id: g.id,
    lat: g.location.lat,
    lng: g.location.lng,
    category: g.category,
    priority: g.priority,
    status: g.status,
    incident_id: g.incident_id,
  }));
  const wardCounts = list.reduce<Record<string, number>>((m, g) => {
    if (g.location.ward_id) m[g.location.ward_id] = (m[g.location.ward_id] ?? 0) + 1;
    return m;
  }, {});
  const affected = Object.entries(wardCounts).sort((a, b) => b[1] - a[1]);
  const wardName = (id: string) => wards.data?.find((w) => w.id === id)?.name ?? id;
  const center = points.length
    ? {
        lat: points.reduce((s, p) => s + p.lat, 0) / points.length,
        lng: points.reduce((s, p) => s + p.lng, 0) / points.length,
      }
    : undefined;

  if (alerts.isError) return <ErrorState error={alerts.error} onRetry={() => alerts.refetch()} />;
  if (alerts.isPending)
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <StatSkeleton key={i} />
          ))}
        </div>
        <ListSkeleton rows={4} />
      </div>
    );
  if (!alert)
    return (
      <GovEmpty
        title={t('surge.not_found')}
        description={t('surge.not_found_body')}
        action={
          <Button asChild variant="outline">
            <Link to="/admin/alerts">{t('surge.back_alerts')}</Link>
          </Button>
        }
      />
    );

  return (
    <PageTransition className="space-y-5">
      <div className="contents" data-testid="war-room" />
      <header className="flex flex-wrap items-start gap-3">
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="min-h-11 min-w-11 md:min-h-9 md:min-w-9"
          aria-label={t('surge.back_alerts')}
        >
          <Link to="/admin/alerts">
            <ArrowLeft className="rtl-flip size-4" aria-hidden />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-danger inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase">
            <Siren className="size-3.5" aria-hidden />
            {isSurge ? t('surge.mode') : t('surge.incident_view')}
          </p>
          <h1 className="font-display text-2xl font-semibold">{alert.title_en}</h1>
          <p className="text-muted-foreground text-sm">{alert.detail_en}</p>
          {!!alert.languages?.length && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground text-xs">{t('surge.languages')}</span>
              {alert.languages.map((l) => (
                <LangBadge key={l} lang={l} />
              ))}
            </div>
          )}
        </div>
        <LiveIndicator />
      </header>

      {members.isError ? (
        <ErrorState error={members.error} onRetry={() => members.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5" data-testid="surge-counts">
            {members.isPending ? (
              Array.from({ length: 5 }, (_, i) => <StatSkeleton key={i} />)
            ) : (
              <>
                <KPIStatGov label={t('surge.count_total')} value={counts.total} />
                <KPIStatGov label={t('surge.count_open')} value={counts.open} upIsGood={false} />
                <KPIStatGov label={t('surge.count_critical')} value={counts.critical} upIsGood={false} />
                <KPIStatGov label={t('surge.count_unassigned')} value={counts.unassigned} upIsGood={false} />
                <KPIStatGov label={t('surge.count_resolved')} value={counts.resolved} />
              </>
            )}
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <Panel title={t('surge.map_title')}>
              {members.isPending ? (
                <ListSkeleton rows={3} />
              ) : (
                <GovMap
                  points={points}
                  center={center}
                  zoom={13}
                  height={360}
                  defaultLayers={['heat', 'critical']}
                  availableLayers={['heat', 'clusters', 'critical']}
                />
              )}
              {affected.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2 text-sm" aria-label={t('surge.affected_wards')}>
                  {affected.map(([id, n]) => (
                    <li key={id} className="bg-surface-2 rounded-full border px-3 py-1">
                      {wardName(id)} <span className="tabular text-muted-foreground">· {n}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title={t('rootcause.title')}>
              {members.isPending ? (
                <ListSkeleton rows={3} />
              ) : (
                <RootCauseGraph grievances={list} showTitle={false} />
              )}
            </Panel>
          </div>

          <Panel title={t('surge.board_title')}>
            {members.isPending ? (
              <ListSkeleton rows={3} />
            ) : board.length === 0 ? (
              <GovEmpty title={t('surge.board_empty')} />
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="surge-board">
                {board.map((col) => (
                  <section
                    key={col.key}
                    className="bg-surface-2 rounded-[var(--radius-md)] border p-3"
                    aria-label={col.officer?.name ?? t('surge.unassigned')}
                  >
                    <header className="mb-2 flex items-center gap-2">
                      <span className="bg-surface grid size-8 place-items-center rounded-full border">
                        <UserRound className="size-4" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p
                          className={
                            col.officer ? 'truncate font-medium' : 'text-warning truncate font-medium'
                          }
                        >
                          {col.officer?.name ?? t('surge.unassigned')}
                        </p>
                        {col.officer && (
                          <p className="text-muted-foreground truncate text-xs">{col.officer.designation}</p>
                        )}
                      </div>
                      <span className="tabular text-muted-foreground text-sm">{col.items.length}</span>
                    </header>
                    <ul className="space-y-1.5">
                      {col.items.slice(0, 8).map((g) => (
                        <li key={g.id}>
                          <Link
                            to={`/officer/case/${g.id}`}
                            className="bg-surface hover:border-primary/50 flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm"
                          >
                            <PriorityChip priority={g.priority} size="sm" />
                            <span className="tabular font-mono text-xs">{g.id.slice(-6)}</span>
                            <span className="min-w-0 flex-1 truncate">{g.title.en}</span>
                            <GovStatusChip status={g.status} />
                          </Link>
                        </li>
                      ))}
                      {col.items.length > 8 && (
                        <li className="text-muted-foreground px-2 text-xs">
                          {t('surge.more_cases', { count: col.items.length - 8 })}
                        </li>
                      )}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </Panel>
        </>
      )}
    </PageTransition>
  );
}
