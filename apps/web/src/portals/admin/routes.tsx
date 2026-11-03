// Admin portal routes (Spec C §6). Mounted at /admin/*. Supervisors get the overview and alerts only (Spec C §3).
import { lazy } from 'react';
import { Route, Routes } from 'react-router';
import { DEMO_MODE } from '@/lib/api/client';
import { RequireRole } from '@/lib/auth/RequireRole';
import NotFound from '@/app/NotFound';
import { GovLayout } from '@/portals/gov-shared/layout/GovLayout';

const CommandCenter = lazy(() => import('./pages/CommandCenter'));
const CityMap = lazy(() => import('./pages/CityMap'));
const Departments = lazy(() => import('./pages/Departments'));
const Officers = lazy(() => import('./pages/Officers'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Alerts = lazy(() => import('./pages/Alerts'));
const Audit = lazy(() => import('./pages/Audit'));
const AIModel = lazy(() => import('./pages/AIModel'));
const Reports = lazy(() => import('./pages/Reports'));
const DemoControls = lazy(() => import('./pages/DemoControls'));
const WarRoom = lazy(() => import('./pages/WarRoom'));
const AssetDetail = lazy(() => import('./pages/Assets'));
const AssetSheet = lazy(() => import('./pages/Assets').then((m) => ({ default: m.AssetSheet })));

export default function AdminRoutes() {
  return (
    <Routes>
      <Route element={<RequireRole roles={['admin', 'supervisor']} />}>
        <Route element={<GovLayout />}>
          <Route index element={<CommandCenter />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="surge/:alertId" element={<WarRoom />} />
          <Route element={<RequireRole roles={['admin']} />}>
            <Route path="map" element={<CityMap />} />
            <Route path="departments" element={<Departments />} />
            <Route path="officers" element={<Officers />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="audit" element={<Audit />} />
            <Route path="ai" element={<AIModel />} />
            <Route path="reports" element={<Reports />} />
            <Route path="assets" element={<AssetSheet />} />
            <Route path="assets/:id" element={<AssetDetail />} />
            {DEMO_MODE && <Route path="demo" element={<DemoControls />} />}
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}
