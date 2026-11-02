// Citizen portal (Laptop A). Mounted at the router catch-all; owns these top-level paths (Spec A §4):
//   /login /onboarding /app/* /track /r/:assetId /guide /print/receipt/:id /print/report/:id, and `*` → 404.
import { lazy } from 'react';
import { Route, Routes } from 'react-router';
import { RequireRole } from '@/lib/auth/RequireRole';
import NotFound from '@/app/NotFound';
import { CitizenLayout, PublicCitizenLayout } from './CitizenLayout';

const Login = lazy(() => import('./pages/Login'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Home = lazy(() => import('./pages/Home'));
const Complaints = lazy(() => import('./pages/Complaints'));
const ComplaintDetail = lazy(() => import('./pages/ComplaintDetail'));
const Track = lazy(() => import('./pages/Track'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Settings = lazy(() => import('./pages/Settings'));
const Nearby = lazy(() => import('./pages/Nearby'));
const AssetEntry = lazy(() => import('./pages/AssetEntry'));
const Report = lazy(() => import('./report/ReportPage'));
const QuickReport = lazy(() => import('./pages/Placeholders').then((m) => ({ default: m.QuickReport })));
const Guide = lazy(() => import('./pages/Placeholders').then((m) => ({ default: m.Guide })));
const PrintReceipt = lazy(() => import('./pages/PrintReceipt'));
const PrintReport = lazy(() => import('./pages/PrintReceipt').then((m) => ({ default: m.PrintReport })));

export default function CitizenRoutes() {
  return (
    <Routes>
      <Route element={<PublicCitizenLayout />}>
        <Route path="login" element={<Login />} />
        <Route path="onboarding" element={<Onboarding />} />
        <Route path="track" element={<Track />} />
        <Route path="r/:assetId" element={<AssetEntry />} />
        <Route path="guide" element={<Guide />} />
      </Route>
      <Route path="print/receipt/:id" element={<PrintReceipt />} />
      <Route path="print/report/:id" element={<PrintReport />} />
      <Route path="app" element={<RequireRole roles={['citizen', 'guest']} />}>
        <Route element={<CitizenLayout />}>
          <Route index element={<Home />} />
          <Route path="report" element={<Report />} />
          <Route path="report/quick" element={<QuickReport />} />
          <Route path="complaints" element={<Complaints />} />
          <Route path="complaints/:id" element={<ComplaintDetail />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="nearby" element={<Nearby />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
