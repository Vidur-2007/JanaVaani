// Citizen home (Spec A §5.3): greeting, 4 action tiles, active complaints carousel, verification callout,
// unread banner, nearby teaser with "Me too". Simple mode: only the tiles + active list.
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Bell, Camera, ChevronRight, HandHeart, Keyboard, MapPinned, Mic, Search, ShieldQuestion } from 'lucide-react';
import { toast } from 'sonner';
import type { Grievance, GeoPoint } from '@contracts/types';
import { Button } from '@/design/ui/button';
import {
  DepartmentBadge,
  EmptyState,
  ErrorState,
  HYDERABAD,
  ListSkeleton,
  PageTransition,
  Skeleton,
  SLACountdown,
  StatusChip,
} from '@/design/components';
import { listItem, pressable, stagger } from '@/design/motion';
import { errorMessage } from '@/lib/api/client';
import { api, qk } from '@/lib/api/endpoints';
import { useAuth } from '@/lib/auth/useAuth';
import { pickLocalized } from '@/lib/localized';
import { usePrefs } from '@/lib/prefs/store';
import { cn } from '@/lib/utils';

const OPEN = ['registered', 'needs_review', 'assigned', 'in_progress', 'reopened', 'resolved_pending_verification'] as const;
const STOPPED = ['resolved_pending_verification'];

function Tiles() {
  const { t } = useTranslation('citizen');
  const voiceFirst = usePrefs((s) => s.voice_first);
  const tiles = [
    { key: 'voice', to: '/app/report?mode=voice', icon: Mic, primary: true },
    { key: 'photo', to: '/app/report/quick', icon: Camera },
    { key: 'type', to: '/app/report?mode=text', icon: Keyboard },
    { key: 'track', to: '/app/complaints', icon: Search },
  ];
  return (
    <motion.div variants={stagger()} initial="initial" animate="animate" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map(({ key, to, icon: Icon, primary }, i) => (
        <motion.div key={key} custom={i} variants={listItem} {...pressable} className={cn(primary && voiceFirst && 'col-span-2 lg:col-span-1')}>
          <Link
            to={to}
            className={cn(
              'flex min-h-32 flex-col justify-between rounded-[var(--radius-xl)] p-4 transition-shadow',
              primary ? 'bg-primary text-primary-foreground shadow-glow-primary' : 'bg-surface hover:border-primary/40 border',
            )}
            data-testid={`tile-${key}`}
          >
            <Icon className="size-8" aria-hidden />
            <span className="font-display text-lg leading-tight font-semibold">{t(`tiles.${key}`)}</span>
          </Link>
        </motion.div>
      ))}
    </motion.div>
  );
}

function ActiveCard({ g }: { g: Grievance }) {
  const { i18n } = useTranslation();
  const title = pickLocalized(g.title, i18n.language);
  return (
    <Link
      to={`/app/complaints/${g.id}`}
      className="bg-surface hover:border-primary/40 flex h-full w-[min(20rem,80vw)] shrink-0 snap-start flex-col gap-3 rounded-[var(--radius-lg)] border p-4 transition-colors"
      data-testid="grievance-card"
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip status={g.status} size="sm" />
        <DepartmentBadge department={g.category} size="sm" iconOnly />
      </div>
      <p className="line-clamp-2 font-medium" lang={title.lang} dir={title.dir}>
        {title.text}
      </p>
      <div className="text-muted-foreground mt-auto flex items-center justify-between gap-2 text-xs">
        <span className="font-mono">{g.id}</span>
        <SLACountdown sla={g.sla} stopped={STOPPED.includes(g.status)} compact />
      </div>
    </Link>
  );
}

function ActiveComplaints() {
  const { t } = useTranslation('citizen');
  const simple = usePrefs((s) => s.simple_mode);
  const q = useQuery({
    queryKey: qk.grievances.mine({ status: [...OPEN] }),
    queryFn: ({ signal }) => api.myGrievances({ status: [...OPEN] }, signal),
  });
  const pending = q.data?.items.filter((g) => g.status === 'resolved_pending_verification') ?? [];
  return (
    <>
      {!simple && pending.length > 0 && (
        <Link
          to={`/app/complaints/${pending[0].id}`}
          className="bg-ai/10 border-ai/30 flex items-center gap-3 rounded-[var(--radius-lg)] border p-4"
          data-testid="verify-callout"
        >
          <ShieldQuestion className="text-ai size-6 shrink-0" aria-hidden />
          <span className="flex-1">
            <span className="block font-medium">{t('home.verify_title', { count: pending.length })}</span>
            <span className="text-muted-foreground block text-sm">{t('home.verify_body')}</span>
          </span>
          <ChevronRight className="rtl-flip text-muted-foreground size-5" aria-hidden />
        </Link>
      )}
      <section className="space-y-3" aria-labelledby="active-title" aria-live="polite">
        <div className="flex items-center justify-between gap-2">
          <h2 id="active-title" className="font-display text-lg font-semibold">
            {t('home.active')}
          </h2>
          {q.data && q.data.items.length > 0 && (
            <Link to="/app/complaints" className="text-primary touch-target inline-flex items-center text-sm font-medium">
              {t('home.see_all')}
            </Link>
          )}
        </div>
        {q.isPending ? (
          <ListSkeleton rows={1} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} compact />
        ) : q.data.items.length === 0 ? (
          <EmptyState title={t('home.empty_title')} description={t('home.empty_body')} />
        ) : (
          <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0" aria-label={t('home.active')}>
            {q.data.items.map((g) => (
              <li key={g.id} className="flex">
                <ActiveCard g={g} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function UnreadBanner() {
  const { t } = useTranslation('citizen');
  const q = useQuery({ queryKey: qk.notifications.list(), queryFn: ({ signal }) => api.notifications({}, signal) });
  const unread = q.data?.items.filter((n) => !n.read).length ?? 0;
  if (!unread) return null;
  return (
    <Link to="/app/notifications" className="bg-surface flex items-center gap-3 rounded-[var(--radius-lg)] border p-3" data-testid="unread-banner">
      <span className="bg-primary/15 text-primary relative grid size-10 place-items-center rounded-full">
        <Bell className="size-5" aria-hidden />
        <span className="bg-primary absolute -end-0.5 -top-0.5 size-3 rounded-full ring-2 ring-[var(--surface)]" aria-hidden />
      </span>
      <span className="flex-1 font-medium">{t('home.unread', { count: unread })}</span>
      <ChevronRight className="rtl-flip text-muted-foreground size-5" aria-hidden />
    </Link>
  );
}

/** Where the citizen is: device location if they consented, else the city center. */
function useHere(): GeoPoint {
  const consent = usePrefs((s) => s.consent_location);
  const [here, setHere] = useState<GeoPoint>(HYDERABAD);
  useEffect(() => {
    if (!consent || !('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setHere({ lat: +p.coords.latitude.toFixed(5), lng: +p.coords.longitude.toFixed(5) }),
      () => undefined,
      { maximumAge: 300_000, timeout: 8_000 },
    );
  }, [consent]);
  return here;
}

function NearbyTeaser() {
  const { t, i18n } = useTranslation('citizen');
  const qc = useQueryClient();
  const here = useHere();
  const params = { lat: here.lat, lng: here.lng, radius_m: 5000 };
  const q = useQuery({ queryKey: qk.public.nearby(params), queryFn: ({ signal }) => api.publicNearby(params, signal) });
  const [supported, setSupported] = useState<Record<string, boolean>>({});
  const support = useMutation({
    mutationFn: (id: string) => api.supportGrievance(id),
    onSuccess: (_r, id) => {
      setSupported((s) => ({ ...s, [id]: true }));
      toast.success(t('home.supported'));
      qc.invalidateQueries({ queryKey: qk.public.all });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <section className="space-y-3" aria-labelledby="nearby-title">
      <div className="flex items-center justify-between gap-2">
        <h2 id="nearby-title" className="font-display text-lg font-semibold">
          {t('nearby.title')}
        </h2>
        <Link to="/app/nearby" className="text-primary touch-target inline-flex items-center gap-1 text-sm font-medium">
          <MapPinned className="size-4" aria-hidden />
          {t('home.open_map')}
        </Link>
      </div>
      {q.isPending ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 rounded-[var(--radius-lg)]" />
          ))}
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} compact />
      ) : q.data.length === 0 ? (
        <EmptyState icon={MapPinned} title={t('home.nearby_empty')} className="py-6" />
      ) : (
        <ul className="space-y-2">
          {q.data.slice(0, 3).map((n) => {
            const title = pickLocalized(n.title, i18n.language);
            const done = supported[n.grievance_id];
            return (
              <li key={n.grievance_id} className="bg-surface flex items-center gap-3 rounded-[var(--radius-lg)] border p-3">
                <DepartmentBadge department={n.category} size="sm" iconOnly />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" lang={title.lang} dir={title.dir}>
                    {title.text}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {t('home.distance', { distance: n.distance_m < 1000 ? `${n.distance_m} m` : `${(n.distance_m / 1000).toFixed(1)} km` })} ·{' '}
                    {t('home.reports', { count: n.support_count + 1 + (done ? 1 : 0) })}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={done ? 'secondary' : 'outline'}
                  className="touch-target shrink-0"
                  disabled={done || support.isPending}
                  onClick={() => support.mutate(n.grievance_id)}
                  aria-pressed={done}
                >
                  <HandHeart className="size-4" aria-hidden />
                  {done ? t('home.supported_short') : t('home.me_too')}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default function Home() {
  const { t } = useTranslation('citizen');
  const { profile } = useAuth();
  const simple = usePrefs((s) => s.simple_mode);
  const name = profile && profile.role !== 'guest' ? profile.name.split(' ')[0] : null;
  return (
    <PageTransition className="space-y-8">
      <header>
        <h1 className="font-display text-2xl font-semibold md:text-3xl">{name ? t('home.greeting', { name }) : t('home.greeting_guest')}</h1>
        <p className="text-muted-foreground">{t('home.subtitle')}</p>
      </header>
      <Tiles />
      {!simple && <UnreadBanner />}
      <ActiveComplaints />
      {!simple && <NearbyTeaser />}
    </PageTransition>
  );
}
