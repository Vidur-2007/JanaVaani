// QR asset entry (Spec A §5.13, feature 227): /r/:assetId on a pole/drain/bin sticker. Shows the asset card, any open
// issues on it ("Already reported — add your support"), and a report button that opens the assistant with the asset
// and its location prefilled. Visitors without a session silently get a guest one.
import { useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  Construction,
  Droplets,
  Lightbulb,
  MapPin,
  QrCode,
  TrafficCone,
  Trash2,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import type { Asset } from '@contracts/types';
import { Button } from '@/design/ui/button';
import {
  EmptyState,
  ErrorState,
  MapView,
  PageSkeleton,
  PageTransition,
  StatusChip,
} from '@/design/components';
import { ApiRequestError } from '@/lib/api/client';
import { api, qk } from '@/lib/api/endpoints';
import { useAuth } from '@/lib/auth';
import { useLangFormat } from '@/lib/i18n/useLangFormat';
import { pickLocalized } from '@/lib/localized';
import { AffectedTooButton, type PublicSummary } from '../tracker/AffectedToo';

const TYPE_ICON: Record<Asset['type'], LucideIcon> = {
  streetlight: Lightbulb,
  drain: Waves,
  water_pipe: Droplets,
  bin: Trash2,
  road_segment: Construction,
  signal: TrafficCone,
};

/** Signs a visitor in as a guest once, so reporting and "add your support" work straight from the QR scan. */
function useSilentGuest() {
  const { status, signInAsGuest } = useAuth();
  const tried = useRef(false);
  useEffect(() => {
    if (status !== 'anonymous' || tried.current) return;
    tried.current = true;
    signInAsGuest().catch(() => undefined); // Reporting still works via /login if this fails.
  }, [status, signInAsGuest]);
  return status;
}

function OpenIssues({ asset }: { asset: Asset }) {
  const { t, i18n } = useTranslation('citizen');
  const { profile } = useAuth();
  const near = { lat: asset.location.lat, lng: asset.location.lng, radius_m: 500 };
  // The public nearby feed carries the public-safe title/status for issues on this asset.
  const q = useQuery({
    queryKey: qk.public.nearby(near),
    queryFn: ({ signal }) => api.publicNearby(near, signal),
  });
  const byId = new Map((q.data ?? []).map((n) => [n.grievance_id, n]));
  return (
    <section
      className="border-warning/40 bg-warning/8 space-y-3 rounded-[var(--radius-lg)] border p-4"
      data-testid="asset-open-issues"
    >
      <h2 className="font-semibold">{t('asset.already')}</h2>
      <p className="text-muted-foreground text-sm">{t('asset.already_hint')}</p>
      <ul className="space-y-2">
        {asset.open_grievance_ids.map((id) => {
          const n = byId.get(id);
          const title = n ? pickLocalized(n.title, i18n.language) : null;
          const summary: PublicSummary | undefined = n && {
            title: n.title,
            category: n.category,
            status: n.status,
            support_count: n.support_count,
          };
          return (
            <li
              key={id}
              className="bg-surface flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border p-3"
            >
              <span className="w-full min-w-0">
                {title ? (
                  <Link
                    to={`/app/complaints/${id}`}
                    state={{ summary }}
                    className="-my-2.5 line-clamp-2 block py-2.5 font-medium hover:underline"
                    lang={title.lang}
                    dir={title.dir}
                  >
                    {title.text}
                  </Link>
                ) : null}
                <span className="text-muted-foreground font-mono text-xs whitespace-nowrap">{id}</span>
              </span>
              {n && <StatusChip status={n.status} size="sm" />}
              {n && (
                <span className="text-muted-foreground text-xs">
                  {t('tracker.affected', { count: n.support_count + 1 })}
                </span>
              )}
              {profile && (
                <span className="ms-auto">
                  <AffectedTooButton id={id} size="sm" />
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function AssetEntry() {
  const { assetId = '' } = useParams();
  const { t } = useTranslation('citizen');
  const fmt = useLangFormat();
  const auth = useSilentGuest();
  const q = useQuery({
    queryKey: qk.meta.asset(assetId),
    queryFn: ({ signal }) => api.asset(assetId, signal),
  });
  const wards = useQuery({
    queryKey: qk.meta.wards,
    queryFn: ({ signal }) => api.wards(signal),
    staleTime: Infinity,
  });
  const notFound = q.error instanceof ApiRequestError && q.error.status === 404;

  return (
    <PageTransition className="max-w-2xl space-y-4">
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <QrCode className="text-primary size-4" aria-hidden />
        {t('asset.scanned')}
      </p>
      {q.isPending ? (
        <PageSkeleton className="p-0 md:p-0" />
      ) : notFound ? (
        <EmptyState
          icon={QrCode}
          title={t('asset.not_found')}
          description={t('asset.not_found_hint', { id: assetId })}
        />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        (() => {
          const a = q.data;
          const Icon = TYPE_ICON[a.type] ?? QrCode;
          const ward = wards.data?.find((w) => w.id === a.ward_id);
          const type = t(`asset.types.${a.type}`);
          const lastFixed = a.history
            .filter((h) => h.closed_at)
            .sort((x, y) => Date.parse(y.closed_at!) - Date.parse(x.closed_at!))[0];
          return (
            <>
              <article
                className="bg-surface overflow-hidden rounded-[var(--radius-xl)] border"
                data-testid="asset-card"
              >
                <div className="flex items-start gap-4 p-5">
                  <span className="bg-primary/12 text-primary grid size-14 shrink-0 place-items-center rounded-2xl">
                    <Icon className="size-7" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                      {type}
                    </p>
                    <h1 className="font-display text-2xl font-semibold" lang="en">
                      {a.label_en}
                    </h1>
                    <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <span className="font-mono">{a.id}</span>
                      {ward && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3.5" aria-hidden />
                          {ward.name} · {ward.zone}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <MapView
                  center={a.location}
                  zoom={16}
                  height={180}
                  scrollWheelZoom={false}
                  ariaLabel={t('asset.map_label', { label: a.label_en })}
                />
                <dl className="grid grid-cols-2 gap-px border-t">
                  <div className="p-4">
                    <dt className="text-muted-foreground text-xs">{t('asset.open_issues')}</dt>
                    <dd
                      className="font-display text-xl font-semibold tabular-nums"
                      data-testid="asset-open-count"
                    >
                      {fmt.number(a.open_grievance_ids.length)}
                    </dd>
                  </div>
                  <div className="border-s p-4">
                    <dt className="text-muted-foreground text-xs">{t('asset.past_issues')}</dt>
                    <dd className="font-display text-xl font-semibold tabular-nums">
                      {fmt.number(a.history.length)}
                    </dd>
                    {lastFixed && (
                      <dd className="text-muted-foreground text-xs">
                        {t('asset.last_fixed', { when: fmt.relative(lastFixed.closed_at!) })}
                      </dd>
                    )}
                  </div>
                </dl>
              </article>

              {a.open_grievance_ids.length > 0 && <OpenIssues asset={a} />}

              <Button
                asChild
                size="lg"
                className="touch-target w-full"
                variant={a.open_grievance_ids.length ? 'outline' : 'default'}
                disabled={auth === 'loading'}
              >
                <Link to={`/app/report?asset=${encodeURIComponent(a.id)}`} data-testid="asset-report">
                  {a.open_grievance_ids.length
                    ? t('asset.report_different')
                    : t('asset.report_type', { type: type.toLowerCase() })}
                </Link>
              </Button>
              <p className="text-muted-foreground text-center text-xs">{t('asset.prefill_note')}</p>
            </>
          );
        })()
      )}
    </PageTransition>
  );
}
