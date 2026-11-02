// Mock auth used when VITE_API_MODE=mock (or Supabase is not configured).
// The signed-in demo profile is stored in localStorage so the role switcher survives reloads.
import { DEMO_PASSWORD, DEMO_USERS, GUEST_PROFILE, type MockProfile } from '@mocks/data/people';
import type { Role } from '@contracts/types';
import type { Profile } from './types';

const KEY = 'jv.mockAuth';

export function readMockSession(): MockProfile | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as MockProfile) : null;
  } catch {
    return null;
  }
}

export function writeMockSession(p: MockProfile | null) {
  if (p) localStorage.setItem(KEY, JSON.stringify(p));
  else localStorage.removeItem(KEY);
}

export const toProfile = (m: MockProfile): Profile => ({
  id: m.id,
  role: m.role,
  name: m.name,
  email: m.email || undefined,
  preferred_language: m.preferred_language,
  department_id: m.department_id,
});

export function findDemoUser(roleOrEmail: Role | string): MockProfile | undefined {
  if (roleOrEmail === 'guest') return GUEST_PROFILE;
  return DEMO_USERS.find((u) => u.email === roleOrEmail.toLowerCase()) ?? DEMO_USERS.find((u) => u.role === roleOrEmail);
}

export function mockPasswordLogin(email: string, password: string): MockProfile {
  const u = DEMO_USERS.find((x) => x.email === email.trim().toLowerCase());
  if (!u || password !== DEMO_PASSWORD) throw new Error('Invalid email or password');
  return u;
}

/** Any email works in mock mode: demo emails map to their persona, others become a new citizen. */
export function mockMagicLink(email: string): MockProfile {
  const e = email.trim().toLowerCase();
  const demo = DEMO_USERS.find((x) => x.email === e);
  if (demo) return demo;
  const name = e.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return { id: `u-${e.replace(/[^a-z0-9]/g, '')}`, role: 'citizen', name, email: e, preferred_language: 'en', persona_en: 'Citizen' };
}

export function mockGuest(): MockProfile {
  const existing = readMockSession();
  if (existing?.role === 'guest') return existing;
  return { ...GUEST_PROFILE, id: `u-guest-${Math.random().toString(36).slice(2, 8)}` };
}
