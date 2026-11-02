// P0 QR asset entry (Spec A §5.13 — P5 adds the guest session + prefilled report).
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { QrCode } from 'lucide-react';
import { Button } from '@/design/ui/button';
import { ErrorState, PageSkeleton, PageTransition } from '@/design/components';
import { api, qk } from '@/lib/api/endpoints';

export default function AssetEntry() {
  const { assetId = '' } = useParams();
  const { t } = useTranslation('citizen');
  const q = useQuery({
    queryKey: qk.meta.asset(assetId),
    queryFn: ({ signal }) => api.asset(assetId, signal),
  });
  return (
    <PageTransition className="space-y-4">
      <h1 className="font-display text-2xl font-semibold">{t('asset.title')}</h1>
      {q.isPending ? (
        <PageSkeleton className="p-0 md:p-0" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <div className="bg-surface space-y-3 rounded-[var(--radius-lg)] border p-4">
          <p className="flex items-center gap-2 font-medium">
            <QrCode className="text-primary size-5" aria-hidden />
            {q.data.label_en}
          </p>
          <p className="text-muted-foreground font-mono text-sm">{q.data.id}</p>
          <Button asChild className="touch-target">
            <Link to={`/app/report?asset=${encodeURIComponent(q.data.id)}`}>{t('asset.report')}</Link>
          </Button>
        </div>
      )}
    </PageTransition>
  );
}
