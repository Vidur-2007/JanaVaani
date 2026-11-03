// Nearby issues (Spec A §5.14, feature 175): map + list of /public/nearby around the citizen (GPS when allowed, else
// their latest complaint's area) or wherever they pan the map; radius slider 250 m–2 km. Public-safe fields only;
// "I'm affected too" on each item.
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Crosshair, Loader2, MapPinned } from 'lucide-react';
import { toast } from 'sonner';
import type { GeoPoint, Status } from '@contracts/types';
import { Button } from '@/design/ui/button';
import { Label } from '@/design/ui/label';
import { Skeleton } from '@/design/ui/skeleton';
import { Slider } from '@/design/ui/slider';
import {
  DepartmentBadge,
  EmptyState,
  ErrorState,
  HYDERABAD,
  ListSkeleton,
  PageTransition,
  StatusChip,
  MapChunkBoundary,
} from '@/design/components';
import { api, qk } from '@/lib/api/endpoints';
import { pickLocalized } from '@/lib/localized';
import { usePrefs } from '@/lib/prefs/store';
import { AffectedTooButton, type PublicSummary } from '../tracker/AffectedToo';
import { distanceM } from './nearbyGeo';

const NearbyMap = lazy(() => import('./NearbyMap'));
const OPEN: Status[] = [
  'registered',
  'needs_review',
  'assigned',
  'in_progress',
  'reopened',
  'resolved_pending_verification',
];
const RADIUS = { min: 250, max: 2000, step: 250, initial: 1000 };

/** "750 m" / "1.5 km" in the UI language (Western digits). */
function useDistance() {
  const { i18n } = useTranslation();
  return useMemo(() => {
    const loc = `${i18n.language}-IN-u-nu-latn`;
    const m = new Intl.NumberFormat(loc, {
      style: 'unit',
      unit: 'meter',
      unitDisplay: 'short',
      maximumFractionDigits: 0,
    });
    const km = new Intl.NumberFormat(loc, {
      style: 'unit',
      unit: 'kilometer',
      unitDisplay: 'short',
      maximumFractionDigits: 1,
    });
    return (meters: number) => (meters < 1000 ? m.format(meters) : km.format(meters / 1000));
  }, [i18n.language]);
}

/** Start point: device location (if the citizen allowed it in onboarding), else their latest complaint, else the city. */
function useStartPoint() {
  const consent = usePrefs((s) => s.consent_location);
  const [gps, setGps] = useState<GeoPoint | null | undefined>(
    consent && 'geolocation' in navigator ? undefined : null,
  );
  useEffect(() => {
    if (gps !== undefined) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setGps({ lat: +p.coords.latitude.toFixed(5), lng: +p.coords.longitude.toFixed(5) }),
      () => setGps(null),
      { maximumAge: 300_000, timeout: 8_000 },
    );
  }, [gps]);
  const mine = useQuery({
    queryKey: qk.grievances.mine({ page_size: 1 }),
    queryFn: ({ signal }) => api.myGrievances({ page_size: 1 }, signal),
    enabled: gps === null,
  });
  if (gps) return { start: gps, me: gps };
  if (gps === undefined || mine.isPending) return { start: null, me: null };
  const last = mine.data?.items[0]?.location;
  return { start: last ? { lat: last.lat, lng: last.lng } : HYDERABAD, me: null };
}

export default function Nearby() {
  const { t, i18n } = useTranslation('citizen');
  const dist = useDistance();
  const { start, me: startMe } = useStartPoint();
  const [moved, setMoved] = useState<GeoPoint | null>(null);
  const [me, setMe] = useState<GeoPoint | null>(null);
  const [radius, setRadius] = useState(RADIUS.initial); // committed (queried)
  const [dragging, setDragging] = useState<number | null>(null); // live slider value
  const [locating, setLocating] = useState(false);
  const center = moved ?? start;
  const here = me ?? startMe;

  const params = center && { lat: center.lat, lng: center.lng, radius_m: radius };
  const q = useQuery({
    queryKey: qk.public.nearby(params ?? {}),
    queryFn: ({ signal }) => api.publicNearby(params!, signal),
    enabled: !!params,
    placeholderData: keepPreviousData,
  });
  const map = useQuery({
    queryKey: qk.public.map({ days: 90 }),
    queryFn: ({ signal }) => api.publicMap({ days: 90 }, signal),
    staleTime: 60_000,
  });
  const points = useMemo(
    () =>
      center ? (map.data ?? []).filter((p) => OPEN.includes(p.status) && distanceM(center, p) <= radius) : [],
    [map.data, center, radius],
  );

  const locate = () => {
    if (!('geolocation' in navigator)) return toast.error(t('nearby.no_gps'));
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const g = { lat: +p.coords.latitude.toFixed(5), lng: +p.coords.longitude.toFixed(5) };
        setMe(g);
        setMoved(g);
        setLocating(false);
      },
      () => {
        setLocating(false);
        toast.error(t('nearby.gps_denied'));
      },
      { timeout: 10_000 },
    );
  };

  const shownRadius = dragging ?? radius;
  return (
    <PageTransition className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">{t('nearby.title')}</h1>
          <p className="text-muted-foreground text-sm">{t('nearby.subtitle')}</p>
        </div>
        <Button
          variant="outline"
          className="touch-target"
          onClick={locate}
          disabled={locating}
          data-testid="nearby-locate"
        >
          {locating ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Crosshair className="size-4" aria-hidden />
          )}
          {t('nearby.use_my_location')}
        </Button>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <div className="space-y-3 lg:sticky lg:top-20">
          {center ? (
            <MapChunkBoundary height={320}>
              <Suspense fallback={<Skeleton className="h-80 w-full rounded-[var(--radius-lg)]" />}>
                <NearbyMap
                  center={center}
                  radius={shownRadius}
                  points={points}
                  me={here}
                  onMove={setMoved}
                  ariaLabel={t('nearby.map_label')}
                />
              </Suspense>
            </MapChunkBoundary>
          ) : (
            <Skeleton className="h-80 w-full rounded-[var(--radius-lg)]" />
          )}
          <p className="text-muted-foreground text-xs">{t('nearby.map_hint')}</p>
          <div className="bg-surface space-y-3 rounded-[var(--radius-lg)] border p-4">
            <div className="flex items-center justify-between gap-2">
              <Label id="radius-label" htmlFor="nearby-radius">
                {t('nearby.radius')}
              </Label>
              <span className="font-mono text-sm font-semibold tabular-nums" data-testid="radius-value">
                {dist(shownRadius)}
              </span>
            </div>
            <Slider
              id="nearby-radius"
              thumbProps={{ 'aria-labelledby': 'radius-label', 'aria-valuetext': dist(shownRadius) }}
              min={RADIUS.min}
              max={RADIUS.max}
              step={RADIUS.step}
              value={[shownRadius]}
              onValueChange={([v]) => setDragging(v)}
              onValueCommit={([v]) => {
                setRadius(v);
                setDragging(null);
              }}
              className="py-3"
              data-testid="radius-slider"
            />
            <div className="text-muted-foreground flex justify-between text-xs" aria-hidden>
              <span>{dist(RADIUS.min)}</span>
              <span>{dist(RADIUS.max)}</span>
            </div>
          </div>
        </div>

        <section aria-labelledby="nearby-list-title" className="space-y-3">
          <h2 id="nearby-list-title" className="flex items-center gap-2 font-semibold" aria-live="polite">
            {q.isFetching && <Loader2 className="text-muted-foreground size-4 animate-spin" aria-hidden />}
            {q.data ? t('nearby.count', { count: q.data.length, distance: dist(radius) }) : t('nearby.title')}
          </h2>
          {!params || (q.isPending && !q.data) ? (
            <ListSkeleton rows={3} />
          ) : q.isError ? (
            <ErrorState error={q.error} onRetry={() => q.refetch()} />
          ) : q.data!.length === 0 ? (
            <EmptyState
              icon={MapPinned}
              title={t('nearby.empty_title', { distance: dist(radius) })}
              description={t('nearby.empty_body')}
            />
          ) : (
            <ul className="space-y-2" data-testid="nearby-list">
              {q.data!.map((n) => {
                const title = pickLocalized(n.title, i18n.language);
                const summary: PublicSummary = {
                  title: n.title,
                  category: n.category,
                  status: n.status,
                  support_count: n.support_count,
                  distance_m: n.distance_m,
                };
                return (
                  <li
                    key={n.grievance_id}
                    className="bg-surface space-y-2 rounded-[var(--radius-lg)] border p-3"
                    data-testid="nearby-item"
                  >
                    <div className="flex items-start gap-3">
                      <DepartmentBadge department={n.category} size="sm" iconOnly />
                      <Link
                        to={`/app/complaints/${n.grievance_id}`}
                        state={{ summary }}
                        className="-my-2.5 line-clamp-2 min-w-0 flex-1 py-2.5 font-medium hover:underline"
                        lang={title.lang}
                        dir={title.dir}
                      >
                        {title.text}
                      </Link>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusChip status={n.status} size="sm" />
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {t('nearby.away', { distance: dist(n.distance_m) })}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {t('tracker.affected', { count: n.support_count + 1 })}
                      </span>
                      <span className="ms-auto">
                        <AffectedTooButton id={n.grievance_id} size="sm" />
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </PageTransition>
  );
}
