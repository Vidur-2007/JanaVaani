// Central router (frozen after P0). Lazy-imports each portal's routes.tsx; A and C only edit their own routes.tsx.
//
//   /                          → portals/landing/routes.tsx
//   /officer/*                 → portals/officer/routes.tsx  (default export)
//   /supervisor/*              → portals/officer/routes.tsx  (named export SupervisorRoutes)
//   /admin/*                   → portals/admin/routes.tsx
//   /public/*                  → portals/public/routes.tsx
//   everything else            → portals/citizen/routes.tsx, which owns
//                                /login /onboarding /app/* /track /r/:assetId /guide /print/*
//                                and its own `*` → NotFound (404)
//
// Each portal routes.tsx renders its own <Routes> with paths relative to its mount point
// (e.g. officer: "" = /officer, "case/:id" = /officer/case/:id).
import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { RouteFallback } from '@/design/components/Skeletons';
import { MockFallbackBadge } from '@/lib/api/MockFallbackBadge';
import { AfterIdle } from './AfterIdle';
import { ErrorBoundary } from './ErrorBoundary';

const LandingRoutes = lazy(() => import('@/portals/landing/routes'));
const CitizenRoutes = lazy(() => import('@/portals/citizen/routes'));
const OfficerRoutes = lazy(() => import('@/portals/officer/routes'));
const SupervisorRoutes = lazy(() =>
  import('@/portals/officer/routes').then((m) => ({ default: m.SupervisorRoutes })),
);
// P6: demo-only chrome, loaded after idle (keeps Radix menu + floating-ui off every page's critical path).
const DemoRoleSwitcher = lazy(() =>
  import('@/lib/auth/DemoRoleSwitcher').then((m) => ({ default: m.DemoRoleSwitcher })),
);
const AdminRoutes = lazy(() => import('@/portals/admin/routes'));
const PublicRoutes = lazy(() => import('@/portals/public/routes'));

function Portal({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<RouteFallback />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route
        index
        element={
          <Portal>
            <LandingRoutes />
          </Portal>
        }
      />
      <Route
        path="officer/*"
        element={
          <Portal>
            <OfficerRoutes />
          </Portal>
        }
      />
      <Route
        path="supervisor/*"
        element={
          <Portal>
            <SupervisorRoutes />
          </Portal>
        }
      />
      <Route
        path="admin/*"
        element={
          <Portal>
            <AdminRoutes />
          </Portal>
        }
      />
      <Route
        path="public/*"
        element={
          <Portal>
            <PublicRoutes />
          </Portal>
        }
      />
      <Route
        path="*"
        element={
          <Portal>
            <CitizenRoutes />
          </Portal>
        }
      />
    </Routes>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <AppRoutes />
      <AfterIdle>
        <Suspense fallback={null}>
          <DemoRoleSwitcher />
        </Suspense>
      </AfterIdle>
      <MockFallbackBadge />
    </BrowserRouter>
  );
}
