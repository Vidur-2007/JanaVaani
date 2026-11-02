// /app/complaints/:id — the complaint tracker (Spec A §5.10).
import { Link, useLocation, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { ErrorState, PageSkeleton, PageTransition } from '@/design/components';
import { ApiRequestError } from '@/lib/api/client';
import { api, qk } from '@/lib/api/endpoints';
import { AffectedToo, type PublicSummary } from '../tracker/AffectedToo';
import { Tracker } from '../tracker/Tracker';

export default function ComplaintDetail() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation('common');
  const summary = (useLocation().state as { summary?: PublicSummary } | null)?.summary;
  const q = useQuery({
    queryKey: qk.grievances.detail(id),
    queryFn: ({ signal }) => api.getGrievance(id, { lang: i18n.language }, signal),
  });
  return (
    <PageTransition className="space-y-4">
      <Link to="/app/complaints" className="text-muted-foreground hover:text-text touch-target inline-flex items-center gap-1 text-sm">
        <ArrowLeft className="rtl-flip size-4" aria-hidden />
        {t('actions.back')}
      </Link>
      {q.isPending ? (
        <PageSkeleton className="p-0 md:p-0" />
      ) : q.error instanceof ApiRequestError && q.error.status === 403 ? (
        // Someone else's complaint (e.g. opened from Nearby): offer "I'm affected too".
        <AffectedToo id={id} summary={summary} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        // The API only returns a complaint's detail to its owner (or with the PIN), so a loaded tracker is the owner's.
        <Tracker g={q.data} isOwner />
      )}
    </PageTransition>
  );
}
