// Admin portal routes (Spec C §6). Mounted at /admin/*. Supervisors get the overview and alerts only (Spec C §3).
import { lazy } from 'react';
import { Route, Routes } from 'react-router';
import { RequireRole } from '@/lib/auth/RequireRole';
import NotFound from '@/app/NotFound';
import { GovLayout } from '@/portals/gov-shared/layout/GovLayout';
import { GovPlaceholder } from '@/portals/gov-shared/components/GovPlaceholder';

const CommandCenter = lazy(() => import('./pages/CommandCenterStub'));

const ADMIN_ONLY = [
  ['map', 'nav.map'],
  ['departments', 'nav.departments'],
  ['officers', 'nav.officers'],
  ['analytics', 'nav.analytics'],
  ['audit', 'nav.audit'],
  ['ai', 'nav.ai'],
  ['reports', 'nav.reports'],
  ['demo', 'nav.demo'],
];

export default function AdminRoutes() {
  return (
    <Routes>
      <Route element={<RequireRole roles={['admin', 'supervisor']} />}>
        <Route element={<GovLayout />}>
          <Route index element={<CommandCenter />} />
          <Route path="alerts" element={<GovPlaceholder titleKey="nav.alerts" />} />
          <Route element={<RequireRole roles={['admin']} />}>
            {ADMIN_ONLY.map(([path, titleKey]) => (
              <Route key={path} path={path} element={<GovPlaceholder titleKey={titleKey} />} />
            ))}
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}
