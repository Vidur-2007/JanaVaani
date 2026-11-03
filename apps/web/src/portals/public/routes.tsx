// Public portal routes (Spec C §7). Mounted at /public/*, no login.
import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import NotFound from '@/app/NotFound';
import { PageSkeleton } from '@/design/components';
import '@/portals/gov-shared/mocks';

const PublicPortal = lazy(() => import('./PublicPortal'));

export default function PublicRoutes() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Routes>
        <Route index element={<PublicPortal />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
