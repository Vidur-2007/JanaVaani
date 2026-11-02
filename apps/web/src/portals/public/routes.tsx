// PLACEHOLDER routes created by Laptop A in P0 — Laptop C owns this file (Spec C §7). Mounted at /public/*, no login.
import { Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import NotFound from '@/app/NotFound';
import { ErrorState, KPIStat, PageSkeleton, StatSkeleton } from '@/design/components';
import { api, qk } from '@/lib/api/endpoints';
import { useSurfaceTheme } from '@/lib/prefs/store';
import { GovPlaceholder } from '@/portals/gov-shared/components/GovPlaceholder';

function PublicStub() {
  useSurfaceTheme('ink');
  const q = useQuery({ queryKey: qk.public.stats, queryFn: ({ signal }) => api.publicStats(signal) });
  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <GovPlaceholder titleKey="nav.public">
        {q.isPending ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
          </div>
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <KPIStat label="total" value={q.data.total} />
            <KPIStat label="resolved" value={q.data.resolved} />
            <KPIStat label="resolution_rate_pct" value={q.data.resolution_rate_pct} decimals={1} suffix="%" />
          </div>
        )}
      </GovPlaceholder>
    </div>
  );
}

export default function PublicRoutes() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Routes>
        <Route index element={<PublicStub />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
