// Department portal routes (Spec C §5). Default export → /officer/*, named SupervisorRoutes → /supervisor/*.
import { lazy } from 'react';
import { Route, Routes } from 'react-router';
import { RequireRole } from '@/lib/auth/RequireRole';
import NotFound from '@/app/NotFound';
import { GovLayout } from '@/portals/gov-shared/layout/GovLayout';

const Inbox = lazy(() => import('./pages/Inbox'));
const Incidents = lazy(() => import('./pages/Incidents'));
const CaseDetail = lazy(() => import('./pages/CaseDetail'));
const MyStats = lazy(() => import('./pages/MyStats'));
const SupervisorQueues = lazy(() => import('./pages/SupervisorQueues'));

export default function OfficerRoutes() {
  return (
    <Routes>
      <Route element={<RequireRole roles={['officer', 'supervisor', 'admin']} />}>
        <Route element={<GovLayout />}>
          <Route index element={<Inbox />} />
          <Route path="case/:id" element={<CaseDetail />} />
          <Route path="incidents" element={<Incidents />} />
          <Route path="stats" element={<MyStats />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}

export function SupervisorRoutes() {
  return (
    <Routes>
      <Route element={<RequireRole roles={['supervisor', 'admin']} />}>
        <Route element={<GovLayout />}>
          <Route index element={<SupervisorQueues />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}
