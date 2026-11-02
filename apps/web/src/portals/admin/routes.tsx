// PLACEHOLDER routes created by Laptop A in P0 — Laptop C owns this file (Spec C §6). Mounted at /admin/*.
import { lazy } from 'react';
import { Route, Routes } from 'react-router';
import { RequireRole } from '@/lib/auth/RequireRole';
import NotFound from '@/app/NotFound';
import { GovLayout } from '@/portals/gov-shared/layout/GovLayout';
import { GovPlaceholder } from '@/portals/gov-shared/components/GovPlaceholder';

const CommandCenter = lazy(() => import('./pages/CommandCenterStub'));

const PAGES = ['map', 'departments', 'officers', 'analytics', 'alerts', 'audit', 'ai', 'reports', 'demo'];

export default function AdminRoutes() {
  return (
    <Routes>
      <Route element={<RequireRole roles={['admin', 'supervisor']} />}>
        <Route element={<GovLayout />}>
          <Route index element={<CommandCenter />} />
          {PAGES.map((p) => (
            <Route key={p} path={p} element={<GovPlaceholder titleKey="nav.admin" />} />
          ))}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}
