// City map (Spec C §6.2): filters, hotspot presets, ward and cluster detail, and a 30-day heatmap replay.
// MapPoint has no date (gap G2), so replay diffs growing `days=` windows by id: real 5-day frames, no API change.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQueries, useQuery } from '@tanstack/react-query';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { Droplets, Pause, Play, Recycle, Route as RouteIcon, Waves, X } from 'lucide-react';
import type { DepartmentId, MapPoint, Priority, Status } from '@contracts/types';
import { Button } from '@/design/ui/button';
import { DepartmentBadge, ErrorState, PageTransition, TextSkeleton } from '@/design/components';
import { api, qk, type WardsGeoJSON } from '@/lib/api/endpoints';
import { useLangFormat } from '@/lib/i18n/useLangFormat';
import { useReducedMotion } from '@/lib/prefs/store';
import { cn } from '@/lib/utils';
import { FilterBar } from '@/portals/gov-shared/components/FilterBar';
import { GovMap } from '@/portals/gov-shared/components/GovMap';
import { GovStatusChip } from '@/portals/gov-shared/components/GovStatusChip';
import { useUrlFilters } from '@/portals/gov-shared/hooks/useUrlFilters';

const WINDOWS = [5, 10, 15, 20, 25, 30];
const FRAME_MS = 1100;
const MAX_LISTED = 20;

const PRESETS: { key: string; icon: typeof Waves; category: DepartmentId }[] = [
  { key: 'potholes', icon: RouteIcon, category: 'roads' },
  { key: 'water_leaks', icon: Droplets, category: 'water' },
  { key: 'garbage', icon: Recycle, category: 'sanitation' },
  { key: 'drainage', icon: Waves, category: 'drainage' },
];

function PanelShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation('gov');
  return (
    <aside
      data-testid="map-side-panel"
      aria-label={title}
      className="bg-surface z-[600] space-y-3 overflow-y-auto rounded-[var(--radius-md)] border p-3 lg:absolute lg:end-2 lg:top-14 lg:bottom-6 lg:w-80"
    >
      <header className="flex items-center justify-between gap-2">
        <h2 className="font-display text-sm font-semibold">{title}</h2>
        <Button
          variant="ghost"
          size="icon-sm"
          className="min-h-11 min-w-11 md:min-h-8 md:min-w-8"
          aria-label={t('admin.close')}
          onClick={onClose}
        >
          <X className="size-4" aria-hidden />
        </Button>
      </header>
      {children}
    </aside>
  );
}

function WardPanel({
  wardId,
  points,
  geo,
  days,
  onClose,
}: {
  wardId: string;
  points: MapPoint[];
  geo?: WardsGeoJSON;
  days: number;
  onClose: () => void;
}) {
  const { t } = useTranslation('gov');
  const fmt = useLangFormat();
  const breakdown = useQuery({
    queryKey: qk.admin.breakdown({ by: 'ward', days }),
    queryFn: ({ signal }) => api.breakdown({ by: 'ward', days }, signal),
  });
  const incidents = useQuery({
    queryKey: qk.officer.incidents({ ward: wardId }),
    queryFn: ({ signal }) => api.incidents({ ward: wardId }, signal),
  });
  const feature = geo?.features.find((f) => f.properties.id === wardId);
  const row = breakdown.data?.find((r) => r.key === wardId);
  const inside = useMemo(
    () =>
      feature
        ? points.filter((p) =>
            booleanPointInPolygon(
              [p.lng, p.lat],
              feature as unknown as Parameters<typeof booleanPointInPolygon>[1],
            ),
          )
        : [],
    [feature, points],
  );
  const top = useMemo(() => {
    const counts = new Map<DepartmentId, number>();
    inside.forEach((p) => counts.set(p.category, (counts.get(p.category) ?? 0) + 1));
    return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [inside]);
  const critical = inside.filter((p) => p.priority === 'critical' && p.status !== 'closed').length;
  return (
    <PanelShell title={feature?.properties.name ?? wardId} onClose={onClose}>
      {breakdown.isPending ? (
        <TextSkeleton lines={3} />
      ) : breakdown.isError ? (
        <ErrorState compact error={breakdown.error} onRetry={() => breakdown.refetch()} />
      ) : (
        <dl className="grid grid-cols-2 gap-2 text-sm">
          {(
            [
              ['kpi.total', row?.total ?? 0],
              ['kpi.open', row?.open ?? 0],
              ['kpi.overdue', row?.overdue ?? 0],
              ['kpi.critical_open', critical],
            ] as const
          ).map(([k, v]) => (
            <div key={k}>
              <dt className="text-muted-foreground text-xs">{t(k)}</dt>
              <dd className="font-display tabular text-lg font-semibold">{fmt.number(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      <div>
        <h3 className="text-muted-foreground mb-1 text-xs font-medium">{t('admin.top_categories')}</h3>
        <ul className="space-y-1">
          {top.map(([c, n]) => (
            <li key={c} className="flex items-center justify-between gap-2">
              <DepartmentBadge department={c} size="sm" />
              <span className="tabular font-mono text-xs">{fmt.number(n)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="text-muted-foreground mb-1 text-xs font-medium">{t('admin.recurring_spots')}</h3>
        {incidents.data?.length ? (
          <ul className="space-y-1 text-sm">
            {incidents.data.map((i) => (
              <li key={i.id}>
                <bdi lang="en">{i.title_en}</bdi>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">{t('admin.none_recurring')}</p>
        )}
      </div>
      <Link to={`/officer?ward=${wardId}`} className="text-signal text-xs font-medium hover:underline">
        {t('admin.open_ward_cases')}
      </Link>
    </PanelShell>
  );
}

function ClusterPanel({ points, onClose }: { points: MapPoint[]; onClose: () => void }) {
  const { t } = useTranslation('gov');
  const ids = points.flatMap((p) => (p.id ? [p.id] : []));
  const shown = ids.slice(0, MAX_LISTED);
  const cases = useQueries({
    queries: shown.map((id) => ({
      queryKey: qk.grievances.detail(id),
      queryFn: ({ signal }: { signal: AbortSignal }) => api.getGrievance(id, {}, signal),
    })),
  });
  return (
    <PanelShell title={t('map.reports', { count: ids.length })} onClose={onClose}>
      <ul className="divide-y">
        {cases.map((c, i) => (
          <li key={shown[i]} className="py-2" data-testid="cluster-case">
            {c.data ? (
              <Link to={`/officer/case/${c.data.id}`} className="hover:text-primary block space-y-1">
                <span className="block text-sm font-medium">
                  <bdi lang="en">{c.data.title.en}</bdi>
                </span>
                <GovStatusChip status={c.data.status} />
              </Link>
            ) : c.isError ? (
              <span className="text-muted-foreground font-mono text-xs">{shown[i]}</span>
            ) : (
              <TextSkeleton lines={1} />
            )}
          </li>
        ))}
      </ul>
      {ids.length > MAX_LISTED && (
        <p className="text-muted-foreground text-xs">
          {t('admin.more_cases', { count: ids.length - MAX_LISTED })}
        </p>
      )}
    </PanelShell>
  );
}

export default function CityMap() {
  const { t } = useTranslation('gov');
  const { filters, setFilters } = useUrlFilters();
  const reduced = useReducedMotion();
  const [ward, setWard] = useState<string | null>(null);
  const [cluster, setCluster] = useState<MapPoint[] | null>(null);
  const [replay, setReplay] = useState(false);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);

  const q = {
    category: filters.category as DepartmentId | undefined,
    status: filters.status as Status | undefined,
    priority: filters.priority as Priority | undefined,
  };
  const days = 30;
  const windows = useQueries({
    queries: WINDOWS.map((d) => ({
      queryKey: qk.admin.map({ ...q, days: d }),
      queryFn: ({ signal }: { signal: AbortSignal }) => api.adminMap({ ...q, days: d }, signal),
      enabled: replay || d === days,
    })),
  });
  const base = windows[WINDOWS.length - 1];
  const incidents = useQuery({
    queryKey: qk.officer.incidents(),
    queryFn: ({ signal }) => api.incidents({}, signal),
  });
  const breakdown = useQuery({
    queryKey: qk.admin.breakdown({ by: 'ward', days }),
    queryFn: ({ signal }) => api.breakdown({ by: 'ward', days }, signal),
  });
  const geo = useQuery({
    queryKey: qk.meta.wardsGeoJSON,
    queryFn: ({ signal }) => api.wardsGeoJSON(signal),
    staleTime: Infinity,
  });
  const wardValues = useMemo(
    () => Object.fromEntries((breakdown.data ?? []).map((w) => [w.key, w.total])),
    [breakdown.data],
  );

  const replayReady = windows.every((w) => w.data);
  // Frame k hides whatever falls inside the window just newer than it.
  const hidden = replay && replayReady ? windows[WINDOWS.length - 2 - frame]?.data : undefined;
  const allPoints = base.data;
  const points = useMemo(() => {
    if (!hidden) return allPoints ?? [];
    const newer = new Set(hidden.map((p) => p.id));
    return (allPoints ?? []).filter((p) => !newer.has(p.id));
  }, [allPoints, hidden]);

  useEffect(() => {
    if (!playing || !replayReady) return;
    const id = window.setInterval(
      () => {
        setFrame((f) => {
          if (f >= WINDOWS.length - 1) {
            setPlaying(false);
            return f;
          }
          return f + 1;
        });
      },
      reduced ? FRAME_MS * 2 : FRAME_MS,
    );
    return () => window.clearInterval(id);
  }, [playing, replayReady, reduced]);

  const startReplay = () => {
    setReplay(true);
    setFrame(0);
    setPlaying(true);
  };

  return (
    <PageTransition className="space-y-3">
      <h1 className="font-display text-xl font-semibold tracking-tight md:text-2xl">{t('nav.map')}</h1>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label={t('admin.presets')}>
          {PRESETS.map((p) => (
            <Button
              key={p.key}
              variant="outline"
              size="sm"
              aria-pressed={filters.category === p.category}
              className={cn(
                'min-h-11 md:min-h-9',
                filters.category === p.category && 'border-primary/70 text-primary',
              )}
              onClick={() => setFilters({ category: filters.category === p.category ? '' : p.category })}
            >
              <p.icon className="size-4" aria-hidden />
              {t(`admin.preset.${p.key}`)}
            </Button>
          ))}
        </div>
        <FilterBar controls={['category', 'priority', 'status']} className="flex-1" />
      </div>

      <div className="relative">
        {base.isError ? (
          <ErrorState error={base.error} onRetry={() => base.refetch()} />
        ) : (
          <GovMap
            points={points}
            incidents={incidents.data}
            wardValues={wardValues}
            defaultLayers={['heat', 'wards', 'critical']}
            onWardClick={(id) => {
              setCluster(null);
              setWard(id);
            }}
            onClusterClick={(pts) => {
              setWard(null);
              setCluster(pts);
            }}
            height="calc(100dvh - 16.5rem)"
          />
        )}
        {ward && (
          <WardPanel
            wardId={ward}
            points={base.data ?? []}
            geo={geo.data}
            days={days}
            onClose={() => setWard(null)}
          />
        )}
        {cluster && <ClusterPanel points={cluster} onClose={() => setCluster(null)} />}
      </div>

      <section
        aria-label={t('admin.replay')}
        className="bg-surface flex items-center gap-3 rounded-[var(--radius-md)] border p-2"
      >
        <Button
          variant="outline"
          size="sm"
          className="min-h-11 shrink-0 md:min-h-9"
          data-testid="replay-toggle"
          onClick={() => (playing ? setPlaying(false) : startReplay())}
        >
          {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
          {t('admin.replay')}
        </Button>
        <input
          type="range"
          min={0}
          max={WINDOWS.length - 1}
          step={1}
          value={replay ? frame : WINDOWS.length - 1}
          aria-label={t('admin.replay')}
          aria-valuetext={t('admin.replay_frame', { day: ((replay ? frame : WINDOWS.length - 1) + 1) * 5 })}
          disabled={!replay}
          className="accent-primary min-h-11 min-w-0 flex-1 md:min-h-8"
          onChange={(e) => {
            setPlaying(false);
            setFrame(Number(e.target.value));
          }}
        />
        <span
          className="text-muted-foreground tabular shrink-0 text-xs"
          data-testid="replay-label"
          aria-live="polite"
        >
          {replay && !replayReady
            ? t('admin.replay_loading')
            : t('admin.replay_frame', { day: ((replay ? frame : WINDOWS.length - 1) + 1) * 5 })}
        </span>
      </section>
    </PageTransition>
  );
}
