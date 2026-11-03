// Spec C §11 S8: asset "digital twin" page (/admin/assets/:id) — the asset, its complaint history and open issues,
// and its citizen QR (scan → /r/:assetId, Spec A §5.13) — plus a printable QR sheet (/admin/assets?ids=…).
// Data: GET /meta/assets/{id} (#24) only; there is no list endpoint, so the sheet takes asset ids.
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQueries, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Lightbulb, Printer, QrCode } from 'lucide-react';
import type { Asset } from '@contracts/types';
import { Button } from '@/design/ui/button';
import { Label } from '@/design/ui/label';
import { Textarea } from '@/design/ui/textarea';
import { DepartmentBadge, ErrorState, ListSkeleton, PageTransition } from '@/design/components';
import { ApiRequestError } from '@/lib/api/client';
import { api, qk } from '@/lib/api/endpoints';
import { useLangFormat } from '@/lib/i18n/useLangFormat';
import { GovEmpty } from '@/portals/gov-shared/components/GovEmpty';
import { Panel } from '@/portals/gov-shared/components/Panel';

/** The QR a citizen scans: opens the prefilled report for this asset. */
export const assetReportUrl = (id: string) => `${window.location.origin}/r/${encodeURIComponent(id)}`;

function QrImage({ text, size = 160, label }: { text: string; size?: number; label: string }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let alive = true;
    import('qrcode')
      .then((QR) => QR.toDataURL(text, { margin: 1, width: size * 2, errorCorrectionLevel: 'M' }))
      .then((d) => alive && setSrc(d))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [text, size]);
  return src ? (
    <img
      src={src}
      width={size}
      height={size}
      alt={label}
      className="rounded-md bg-white p-1"
      data-testid="asset-qr"
    />
  ) : (
    <span
      className="bg-surface-2 grid place-items-center rounded-md"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <QrCode className="text-muted-foreground size-8" />
    </span>
  );
}

function parseIds(raw: string) {
  return [
    ...new Set(
      raw
        .split(/[\s,;]+/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    ),
  ].slice(0, 48);
}

/** /admin/assets — printable QR sheet. */
export function AssetSheet() {
  const { t } = useTranslation('gov');
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get('ids');
  // No ids in the URL: start from assets citizens have actually reported (QR complaints carry asset_id), so the
  // default sheet is real data in mock and live mode alike. (Mock and B's seed number assets differently.)
  const reported = useQuery({
    queryKey: ['jv', 'admin', 'reported-assets'] as const,
    queryFn: async ({ signal }) => {
      const page = await api.officerInbox(
        {
          page_size: 100,
        },
        signal,
      );
      return [...new Set(page.items.map((g) => g.asset_id).filter(Boolean) as string[])].slice(0, 12);
    },
    enabled: !fromUrl,
  });
  const ids = useMemo(() => parseIds(fromUrl ?? (reported.data ?? []).join(',')), [fromUrl, reported.data]);
  const [draft, setDraft] = useState('');
  useEffect(() => setDraft(ids.join(', ')), [ids]);
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: qk.meta.asset(id),
      queryFn: ({ signal }: { signal: AbortSignal }) => api.asset(id, signal),
      retry: false,
    })),
  });
  return (
    <PageTransition className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="font-display text-2xl font-semibold">{t('assets.sheet_title')}</h1>
          <p className="text-muted-foreground text-sm">{t('assets.sheet_subtitle')}</p>
        </div>
        <Button
          onClick={() => window.print()}
          disabled={!ids.length}
          className="min-h-11 md:min-h-9"
          data-testid="assets-print"
        >
          <Printer className="size-4" aria-hidden />
          {t('assets.print')}
        </Button>
      </header>
      <form
        className="space-y-2 print:hidden"
        onSubmit={(e) => {
          e.preventDefault();
          setParams({ ids: parseIds(draft).join(',') });
        }}
      >
        <Label htmlFor="asset-ids">{t('assets.ids_label')}</Label>
        <Textarea
          id="asset-ids"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          className="font-mono text-sm"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="outline" className="min-h-11 md:min-h-9">
            {t('assets.update_sheet')}
          </Button>
          <span className="text-muted-foreground text-xs">{t('assets.ids_hint')}</span>
        </div>
      </form>
      {!fromUrl && reported.isPending ? (
        <ListSkeleton rows={2} />
      ) : !fromUrl && reported.isError ? (
        <ErrorState error={reported.error} onRetry={() => reported.refetch()} />
      ) : ids.length === 0 ? (
        <GovEmpty title={t('assets.sheet_empty')} description={t('assets.ids_hint')} />
      ) : (
        <ul
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-3 print:gap-4"
          data-testid="qr-sheet"
        >
          {ids.map((id, i) => {
            const r = results[i];
            const a = r?.data as Asset | undefined;
            return (
              <li
                key={id}
                className="bg-surface flex flex-col items-center gap-2 rounded-[var(--radius-md)] border p-3 text-center break-inside-avoid print:border-black"
              >
                <QrImage text={assetReportUrl(id)} size={128} label={t('assets.qr_alt', { id })} />
                <Link
                  to={`/admin/assets/${encodeURIComponent(id)}`}
                  className="tabular font-mono text-sm font-semibold underline-offset-2 hover:underline"
                >
                  {id}
                </Link>
                <span className="text-muted-foreground line-clamp-2 text-xs">
                  {!r || r.isPending ? '…' : a ? a.label_en : t('assets.unknown')}
                </span>
                <span className="text-[11px] font-medium">{t('assets.scan_to_report')}</span>
              </li>
            );
          })}
        </ul>
      )}
    </PageTransition>
  );
}

/** /admin/assets/:id — asset detail. */
export default function AssetDetail() {
  const { t } = useTranslation('gov');
  const fmt = useLangFormat();
  const { id = '' } = useParams();
  const q = useQuery({
    queryKey: qk.meta.asset(id),
    queryFn: ({ signal }) => api.asset(id, signal),
    retry: false,
  });
  if (q.isPending) return <ListSkeleton rows={4} />;
  if (q.isError) {
    if (q.error instanceof ApiRequestError && q.error.status === 404)
      return (
        <GovEmpty
          title={t('assets.not_found', { id })}
          action={
            <Button asChild variant="outline">
              <Link to="/admin/assets">{t('assets.sheet_title')}</Link>
            </Button>
          }
        />
      );
    return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  }
  const a = q.data;
  const history = [...a.history].sort((x, y) => Date.parse(y.created_at) - Date.parse(x.created_at));
  return (
    <PageTransition className="space-y-5">
      <header className="flex flex-wrap items-start gap-3">
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="min-h-11 min-w-11 md:min-h-9 md:min-w-9 print:hidden"
          aria-label={t('assets.sheet_title')}
        >
          <Link to={`/admin/assets?ids=${encodeURIComponent(a.id)}`}>
            <ArrowLeft className="rtl-flip size-4" aria-hidden />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase">
            <Lightbulb className="size-3.5" aria-hidden />
            {t(`assets.type.${a.type}`, { defaultValue: a.type })}
          </p>
          <h1 className="font-display text-2xl font-semibold" data-testid="asset-title">
            {a.label_en}
          </h1>
          <p className="tabular text-muted-foreground font-mono text-sm">
            {a.id} · {a.ward_id}
          </p>
        </div>
        <Button variant="outline" onClick={() => window.print()} className="min-h-11 md:min-h-9 print:hidden">
          <Printer className="size-4" aria-hidden />
          {t('assets.print_label')}
        </Button>
      </header>
      <div className="grid gap-5 md:grid-cols-[auto_1fr]">
        <Panel title={t('assets.qr_title')}>
          <div className="flex flex-col items-center gap-2 text-center">
            <QrImage text={assetReportUrl(a.id)} size={176} label={t('assets.qr_alt', { id: a.id })} />
            <span className="text-xs font-medium">{t('assets.scan_to_report')}</span>
            <span className="text-muted-foreground max-w-48 text-[11px] break-all">
              {assetReportUrl(a.id)}
            </span>
          </div>
        </Panel>
        <div className="space-y-5">
          <Panel title={t('assets.open_issues', { count: a.open_grievance_ids.length })}>
            {a.open_grievance_ids.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t('assets.no_open')}</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {a.open_grievance_ids.map((g) => (
                  <li key={g}>
                    <Link
                      to={`/officer/case/${g}`}
                      className="bg-surface-2 hover:border-primary/50 tabular rounded-full border px-3 py-1 font-mono text-xs"
                    >
                      {g}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title={t('assets.history_title')}>
            {history.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t('assets.no_history')}</p>
            ) : (
              <ol className="border-border ms-2 space-y-3 border-s ps-4" data-testid="asset-history">
                {history.map((h) => (
                  <li key={h.grievance_id} className="relative">
                    <span
                      className={`absolute -start-[1.4rem] top-1.5 size-2.5 rounded-full ${h.closed_at ? 'bg-success' : 'bg-warning'}`}
                      aria-hidden
                    />
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Link
                        to={`/officer/case/${h.grievance_id}`}
                        className="tabular font-mono text-xs underline-offset-2 hover:underline"
                      >
                        {h.grievance_id}
                      </Link>
                      <DepartmentBadge department={h.category} size="sm" />
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {t('assets.reported', { date: fmt.date(h.created_at) })}
                      {h.closed_at
                        ? ` · ${t('assets.closed', { date: fmt.date(h.closed_at) })}`
                        : ` · ${t('assets.still_open')}`}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>
    </PageTransition>
  );
}
