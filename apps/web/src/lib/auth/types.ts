import type { DeepLang, DepartmentId, Role } from '@contracts/types';

export interface Profile {
  id: string;
  role: Role;
  name: string;
  email?: string;
  preferred_language: DeepLang;
  department_id?: DepartmentId;
}

export interface AuthUser {
  id: string;
  email?: string;
  is_anonymous: boolean;
}

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface AuthContextValue {
  user: AuthUser | null;
  profile: Profile | null;
  status: AuthStatus;
  /** 'mock' when VITE_API_MODE=mock or Supabase is not configured. */
  provider: 'mock' | 'supabase';
  signInWithPassword: (email: string, password: string) => Promise<Profile>;
  /** Supabase sends a magic link; mock signs in immediately. Returns the profile when signed in right away. */
  signInWithMagicLink: (email: string) => Promise<Profile | null>;
  signInAsGuest: () => Promise<Profile>;
  /** One-click demo account login (master §14). Accepts a role or a demo email. */
  demoLogin: (roleOrEmail: Role | string) => Promise<Profile>;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

export const GOV_ROLES: Role[] = ['officer', 'supervisor', 'admin'];
export const CITIZEN_ROLES: Role[] = ['citizen', 'guest'];

/** Spec A §5.2: redirect after login by role. */
export function homeForRole(role: Role | undefined | null): string {
  switch (role) {
    case 'officer':
    case 'supervisor':
      return '/officer';
    case 'admin':
      return '/admin';
    default:
      return '/app';
  }
}
