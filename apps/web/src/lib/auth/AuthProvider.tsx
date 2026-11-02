// AuthProvider: Supabase in hybrid/live mode (when configured), mock auth otherwise.
import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Session, User } from '@supabase/supabase-js';
import type { DeepLang, Role } from '@contracts/types';
import { DEMO_PASSWORD, DEMO_USERS, type MockProfile } from '@mocks/data/people';
import { API_MODE, request, setAuthBridge } from '@/lib/api/client';
import type { MeProfile } from '@/lib/api/endpoints';
import { supabase } from '@/lib/supabase';
import { findDemoUser, mockGuest, mockMagicLink, mockPasswordLogin, readMockSession, toProfile, writeMockSession } from './mockAuth';
import type { AuthContextValue, AuthStatus, AuthUser, Profile } from './types';

export const AuthContext = createContext<AuthContextValue | null>(null);

const SUPABASE_AUTH = API_MODE !== 'mock' && supabase !== null;

/** Shape a profile for the mock layer (used by hybrid-mode fallbacks). Demo emails map to their seeded persona. */
function mockUserFor(p: Profile | null): MockProfile | null {
  if (!p) return null;
  const demo = p.email ? DEMO_USERS.find((u) => u.email === p.email) : undefined;
  return demo ?? { id: p.id, role: p.role, name: p.name, email: p.email ?? '', preferred_language: p.preferred_language, department_id: p.department_id, persona_en: '' };
}

async function profileFromSupabase(user: User): Promise<Profile> {
  try {
    const me = await request<MeProfile>('GET', '/me', { mode: 'live' });
    return { ...me, email: me.email ?? user.email };
  } catch {
    // `/me` not live yet: derive from auth metadata, then demo-email persona, then defaults.
    const meta = { ...(user.user_metadata ?? {}), ...(user.app_metadata ?? {}) } as Record<string, unknown>;
    const demo = user.email ? DEMO_USERS.find((u) => u.email === user.email) : undefined;
    const role = (meta.role as Role) ?? demo?.role ?? (user.is_anonymous ? 'guest' : 'citizen');
    return {
      id: user.id,
      role,
      name: (meta.name as string) ?? (meta.full_name as string) ?? demo?.name ?? user.email?.split('@')[0] ?? 'Guest',
      email: user.email,
      preferred_language: ((meta.preferred_language as DeepLang) ?? demo?.preferred_language ?? 'en') as DeepLang,
      department_id: (meta.department_id as Profile['department_id']) ?? demo?.department_id,
    };
  }
}

const toAuthUser = (u: User): AuthUser => ({ id: u.id, email: u.email, is_anonymous: !!u.is_anonymous });

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<Session | null>(null);

  const applyMock = useCallback((m: MockProfile | null) => {
    writeMockSession(m);
    setUser(m ? { id: m.id, email: m.email || undefined, is_anonymous: m.role === 'guest' } : null);
    setProfile(m ? toProfile(m) : null);
    setStatus(m ? 'authenticated' : 'anonymous');
  }, []);

  // ---- bootstrap
  useEffect(() => {
    if (!SUPABASE_AUTH) {
      applyMock(readMockSession());
      // Keep tabs in sync when the role switcher changes the stored session.
      const onStorage = (e: StorageEvent) => e.key === 'jv.mockAuth' && applyMock(readMockSession());
      window.addEventListener('storage', onStorage);
      return () => window.removeEventListener('storage', onStorage);
    }
    let active = true;
    const handle = async (s: Session | null) => {
      if (!active) return;
      setSession(s);
      if (!s?.user) {
        setUser(null);
        setProfile(null);
        setStatus('anonymous');
        return;
      }
      setUser(toAuthUser(s.user));
      const p = await profileFromSupabase(s.user);
      if (!active) return;
      setProfile(p);
      setStatus('authenticated');
    };
    supabase!.auth.getSession().then(({ data }) => handle(data.session));
    const { data } = supabase!.auth.onAuthStateChange((_evt, s) => {
      // Defer so Supabase's internal lock is released before we call the API.
      setTimeout(() => handle(s), 0);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [applyMock]);

  // ---- bridge to the API client
  useEffect(() => {
    setAuthBridge({
      getToken: async () => (SUPABASE_AUTH ? ((await supabase!.auth.getSession()).data.session?.access_token ?? null) : null),
      getMockUser: () => (SUPABASE_AUTH ? mockUserFor(profile) : readMockSession()),
    });
  }, [profile, session]);

  const afterChange = useCallback(() => {
    // Everything user-scoped must refetch for the new identity.
    qc.removeQueries({ queryKey: ['jv', 'grievances'] });
    qc.removeQueries({ queryKey: ['jv', 'notifications'] });
    qc.removeQueries({ queryKey: ['jv', 'officer'] });
    qc.removeQueries({ queryKey: ['jv', 'admin'] });
    qc.removeQueries({ queryKey: ['jv', 'me'] });
  }, [qc]);

  const value = useMemo<AuthContextValue>(() => {
    if (!SUPABASE_AUTH) {
      const signIn = (m: MockProfile) => {
        applyMock(m);
        afterChange();
        return toProfile(m);
      };
      return {
        user,
        profile,
        status,
        provider: 'mock',
        signInWithPassword: async (email, password) => signIn(mockPasswordLogin(email, password)),
        signInWithMagicLink: async (email) => signIn(mockMagicLink(email)),
        signInAsGuest: async () => signIn(mockGuest()),
        demoLogin: async (roleOrEmail) => {
          const m = findDemoUser(roleOrEmail);
          if (!m) throw new Error(`No demo account for ${roleOrEmail}`);
          return signIn(m.role === 'guest' ? mockGuest() : m);
        },
        signOut: async () => {
          applyMock(null);
          afterChange();
        },
        getAccessToken: async () => null,
      };
    }
    const sb = supabase!;
    const waitProfile = async (u: User | null | undefined) => {
      if (!u) throw new Error('Sign-in failed');
      const p = await profileFromSupabase(u);
      setUser(toAuthUser(u));
      setProfile(p);
      setStatus('authenticated');
      afterChange();
      return p;
    };
    return {
      user,
      profile,
      status,
      provider: 'supabase',
      signInWithPassword: async (email, password) => {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return waitProfile(data.user);
      },
      signInWithMagicLink: async (email) => {
        const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/app` } });
        if (error) throw error;
        return null;
      },
      signInAsGuest: async () => {
        const { data, error } = await sb.auth.signInAnonymously();
        if (error) throw error;
        return waitProfile(data.user);
      },
      demoLogin: async (roleOrEmail) => {
        if (roleOrEmail === 'guest') {
          const { data, error } = await sb.auth.signInAnonymously();
          if (error) throw error;
          return waitProfile(data.user);
        }
        const m = findDemoUser(roleOrEmail);
        if (!m) throw new Error(`No demo account for ${roleOrEmail}`);
        const { data, error } = await sb.auth.signInWithPassword({ email: m.email, password: DEMO_PASSWORD });
        if (error) throw error;
        return waitProfile(data.user);
      },
      signOut: async () => {
        await sb.auth.signOut();
        afterChange();
      },
      getAccessToken: async () => (await sb.auth.getSession()).data.session?.access_token ?? null,
    };
  }, [user, profile, status, applyMock, afterChange]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
