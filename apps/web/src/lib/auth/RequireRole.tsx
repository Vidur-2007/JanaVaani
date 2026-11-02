// Route guard. Use as a layout route element:
//   <Route element={<RequireRole roles={['officer', 'supervisor', 'admin']} />}> ...children </Route>
// or wrap content: <RequireRole roles={['admin']}><Page/></RequireRole>
import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import type { Role } from '@contracts/types';
import { PageSkeleton } from '@/design/components/Skeletons';
import { useAuth } from './useAuth';
import { homeForRole } from './types';

export interface RequireRoleProps {
  roles: Role[];
  children?: ReactNode;
  /** Where to send signed-out users (default /login). `next` is appended. */
  loginPath?: string;
}

export function RequireRole({ roles, children, loginPath = '/login' }: RequireRoleProps) {
  const { status, profile } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <PageSkeleton />;
  if (status === 'anonymous' || !profile) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`${loginPath}?next=${next}`} replace />;
  }
  if (!roles.includes(profile.role)) return <Navigate to={homeForRole(profile.role)} replace />;
  return children ? <>{children}</> : <Outlet />;
}
