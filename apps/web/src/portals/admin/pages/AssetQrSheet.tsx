// Printable QR sheet for a ward's assets (Spec C §11, S8). There is no endpoint that lists assets, so the sheet
// starts from assets named in that ward's complaints, and more can be added by id. It says so on the page.
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQueries, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Plus, Printer } from 'lucide-react';
import type { Asset, DepartmentId, Status } from '@contracts/types';
import { Button } from '@/design/ui/button';
import { Input } from '@/design/ui/input';
import { Label } from '@/design/ui/label';
import { useSurfaceTheme } from '@/lib/prefs/store';
import { api, qk } from '@/lib/api/endpoints';
import { assetEntryUrl, useQrDataUrl } from './AssetPage';

const CATEGORY: Partial<Record<Asset['type'], DepartmentId>> = {
  streetlight: 'streetlights',
  drain: 'drainage',
  water_pipe: 'water',
  bin: 'sanitation',
  road_segment: 'roads',
  signal: 'traffic',
};
const STATUSES: Status[] = ['assigned', 'in_progress', 'resolved_pending_verification', 'closed', 'reopened'];

function QrCard({ asset }: { asset: Asset }) {
  const { t } = useTranslation('gov');
  const qr = useQrDataUrl(assetEntryUrl(asset.id));
  return (
    <li
      data-testid="qr-card"
      className="flex break-inside-avoid flex-col items-center gap-1 rounded border border-black/20 p-3 text-center text-black"
    >
      {qr && <img src={qr} alt={t('asset.qr_alt', { id: asset.id })} className="size-36" />}
      <p className="font-mono text-sm font-semibold">{asset.id}</p>
      <p className="text-xs">{asset.label_en}</p>
      <p className="text-[10px]">{t('asset.scan_hint')}</p>
    </li>
  );
}

export default function AssetQrSheet() {
  useSurfaceTheme('paper');
  const { t } = useTranslation('gov');
  const [params, setParams] = useSearchParams();
  const ward = params.get('ward') ?? '';
  const type = (params.get('type') as Asset['type']) || 'streetlight';
  const extra = useMemo(() => (params.get('ids') ?? '').split(',').filter(Boolean), [params]);
  const [draft, setDraft] = useState('');

  const category = CATEGORY[type];
  const complaints = useQueries({
    queries: STATUSES.map((status) => ({
      queryKey: qk.officer.inbox({ status, ward, category, page_size: 100 }),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        api.officerInbox({ status, ward, category, page_size: 100 }, signal),
      enabled: !!ward && !!category,
    })),
  });
  const ids = useMemo(() => {
    const found = complaints.flatMap(
      (c) => c.data?.items.flatMap((g) => (g.asset_id ? [g.asset_id] : [])) ?? [],
    );
    return [...new Set([...extra, ...found])];
  }, [complaints, extra]);
  const assets = useQueries({
    queries: ids.map((id) => ({
      queryKey: qk.meta.asset(id),
      queryFn: ({ signal }: { signal: AbortSignal }) => api.asset(id, signal),
      retry: false,
    })),
  });
  const wards = useQuery({
    queryKey: qk.meta.wards,
    queryFn: ({ signal }) => api.wards(signal),
    staleTime: Infinity,
  });
  const wardName = wards.data?.find((w) => w.id === ward)?.name ?? ward;
  const list = assets.flatMap((a) =>
    a.data && a.data.type === type && (!ward || a.data.ward_id === ward) ? [a.data] : [],
  );
  const missing = ids.filter((_, i) => assets[i]?.isError);
  const loading =
    complaints.some((c) => c.isPending && c.fetchStatus !== 'idle') || assets.some((a) => a.isPending);

  const add = () => {
    const id = draft.trim().toUpperCase();
    if (!id) return;
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('ids', [...new Set([...extra, id])].join(','));
      return next;
    });
    setDraft('');
  };

  return (
    <main id="main" className="mx-auto max-w-4xl space-y-4 bg-white p-6 text-black print:p-0">
      <header className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <Button asChild variant="ghost" size="sm" className="min-h-11 text-black">
          <Link to={extra[0] ? `/admin/assets/${extra[0]}` : '/admin'}>
            <ArrowLeft className="rtl-flip size-4" aria-hidden />
            {t('asset.back')}
          </Link>
        </Button>
        <Button
          size="sm"
          className="min-h-11"
          onClick={() => window.print()}
          disabled={list.length === 0}
          data-testid="print-sheet"
        >
          <Printer className="size-4" aria-hidden />
          {t('asset.print')}
        </Button>
      </header>
      <div>
        <h1 className="font-display text-2xl font-semibold">
          {t('asset.sheet_title', { type: t(`asset.type.${type}`), ward: wardName })}
        </h1>
        <p className="text-sm text-black/70 print:hidden">{t('asset.sheet_note')}</p>
      </div>
      <form
        className="flex items-end gap-2 print:hidden"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <div className="flex-1 space-y-1">
          <Label htmlFor="add-asset">{t('asset.add_id')}</Label>
          <Input
            id="add-asset"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="SL-KHB-0001"
            className="min-h-11 bg-white text-black"
          />
        </div>
        <Button type="submit" variant="outline" className="min-h-11 text-black">
          <Plus className="size-4" aria-hidden />
          {t('asset.add')}
        </Button>
      </form>
      {missing.length > 0 && (
        <p role="alert" className="text-sm text-red-700 print:hidden">
          {t('asset.not_found', { ids: missing.join(', ') })}
        </p>
      )}
      {loading ? (
        <p className="text-sm" role="status">
          {t('asset.loading')}
        </p>
      ) : list.length === 0 ? (
        <p className="text-sm" role="status">
          {t('asset.sheet_empty')}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3">
          {list.map((a) => (
            <QrCard key={a.id} asset={a} />
          ))}
        </ul>
      )}
    </main>
  );
}
