// PLACEHOLDER routes created by Laptop A in P0 — Laptop C owns this file (Spec C §5).
// Default export → /officer/*, named SupervisorRoutes → /supervisor/*. Keep both exports.
import { lazy } from 'react';
import { Route, Routes } from 'react-router';
import { RequireRole } from '@/lib/auth/RequireRole';
import NotFound from '@/app/NotFound';
import { GovLayout } from '@/portals/gov-shared/layout/GovLayout';
import { GovPlaceholder } from '@/portals/gov-shared/components/GovPlaceholder';

const Inbox = lazy(() => import('./pages/InboxStub'));

export default function OfficerRoutes() {
  return (
    <Routes>
      <Route element={<RequireRole roles={['officer', 'supervisor', 'admin']} />}>
        <Route element={<GovLayout />}>
          <Route index element={<Inbox />} />
          <Route path="case/:id" element={<GovPlaceholder titleKey="nav.officer" />} />
          <Route path="incidents" element={<GovPlaceholder titleKey="nav.officer" />} />
          <Route path="stats" element={<GovPlaceholder titleKey="nav.officer" />} />
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
          <Route index element={<GovPlaceholder titleKey="nav.supervisor" />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}
