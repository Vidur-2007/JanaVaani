// Asset page (Spec C §11, S8): one physical asset's complaint history and its citizen QR code.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { CircleMarker } from 'react-leaflet';
import { Printer, QrCode } from 'lucide-react';
import { Button } from '@/design/ui/button';
import { DepartmentBadge, ErrorState, MapView, PageSkeleton, PageTransition } from '@/design/components';
import { api, qk } from '@/lib/api/endpoints';
import { useLangFormat } from '@/lib/i18n/useLangFormat';
import { GovEmpty } from '@/portals/gov-shared/components/GovEmpty';
import { Panel } from '@/portals/gov-shared/components/Panel';

/** The citizen entry point A serves at /r/:assetId. */
export const assetEntryUrl = (id: string) =>
  new URL(`/r/${encodeURIComponent(id)}`, window.location.origin).toString();

export function useQrDataUrl(text: string) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    import('qrcode')
      .then((QR) => QR.toDataURL(text, { margin: 1, width: 320 }))
      .then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [text]);
  return url;
}

export default function AssetPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation('gov');
  const { t: tc } = useTranslation('common');
  const fmt = useLangFormat();
  const q = useQuery({
    queryKey: qk.meta.asset(id),
    queryFn: ({ signal }) => api.asset(id, signal),
    retry: false,
  });
  const wards = useQuery({
    queryKey: qk.meta.wards,
    queryFn: ({ signal }) => api.wards(signal),
    staleTime: Infinity,
  });
  const qr = useQrDataUrl(assetEntryUrl(id));

  if (q.isPending) return <PageSkeleton />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const a = q.data;
  const ward = wards.data?.find((w) => w.id === a.ward_id);
  const history = [...a.history].sort((x, y) => Date.parse(y.created_at) - Date.parse(x.created_at));
  return (
    <PageTransition className="space-y-4">
      <header className="space-y-1">
        <p className="text-muted-foreground font-mono text-xs">{a.id}</p>
        <h1 className="font-display text-xl font-semibold tracking-tight md:text-2xl">{a.label_en}</h1>
        <p className="text-muted-foreground text-sm">
          {t(`asset.type.${a.type}`)} · {ward ? `${ward.name}, ${ward.zone}` : a.ward_id}
        </p>
      </header>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <Panel title={t('case.location')}>
            <MapView center={a.location} zoom={16} height={220} ariaLabel={t('case.location')}>
              <CircleMarker
                center={[a.location.lat, a.location.lng]}
                radius={9}
                pathOptions={{ color: 'var(--primary)', fillColor: 'var(--primary)', fillOpacity: 0.45 }}
              />
            </MapView>
          </Panel>
          <Panel title={t('asset.open_cases', { count: a.open_grievance_ids.length })}>
            {a.open_grievance_ids.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t('asset.no_open')}</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {a.open_grievance_ids.map((g) => (
                  <li key={g}>
                    <Link to={`/officer/case/${g}`} className="hover:text-primary font-mono">
                      {g}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title={t('asset.history')}>
            {history.length === 0 ? (
              <GovEmpty title={t('asset.no_history')} className="py-4" />
            ) : (
              <ol className="divide-y" data-testid="asset-history">
                {history.map((h) => (
                  <li key={h.grievance_id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <DepartmentBadge department={h.category} size="sm" />
                    <Link
                      to={`/officer/case/${h.grievance_id}`}
                      className="hover:text-primary font-mono text-xs"
                    >
                      {h.grievance_id}
                    </Link>
                    <span className="text-muted-foreground ms-auto text-xs">
                      {fmt.date(h.created_at)}
                      {' → '}
                      {h.closed_at ? fmt.date(h.closed_at) : tc('status.in_progress')}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
        <Panel title={t('asset.qr')}>
          <figure className="space-y-2 text-center">
            {qr ? (
              <img
                src={qr}
                alt={t('asset.qr_alt', { id: a.id })}
                className="mx-auto size-48 rounded bg-white p-2"
                data-testid="asset-qr"
              />
            ) : (
              <QrCode className="text-muted-foreground mx-auto size-48" aria-hidden />
            )}
            <figcaption className="text-muted-foreground text-xs break-all">{assetEntryUrl(a.id)}</figcaption>
          </figure>
          <Button asChild variant="outline" size="sm" className="min-h-11 w-full md:min-h-9">
            <Link
              to={`/admin/assets/sheet?ward=${a.ward_id}&type=${a.type}&ids=${a.id}`}
              data-testid="asset-sheet-link"
            >
              <Printer className="size-4" aria-hidden />
              {t('asset.sheet_for_ward')}
            </Link>
          </Button>
        </Panel>
      </div>
    </PageTransition>
  );
}
