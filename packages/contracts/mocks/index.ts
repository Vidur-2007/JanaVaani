// Mock layer entry. The web client calls `runMock()` in mock mode (and as the hybrid-mode fallback).
import { buildDb, getDb } from './db';
import { handlers, MockHttpError, type MockCtx, type MockHandler, type MockHandlerFn } from './handlers';
import { DEMO_USERS, GUEST_PROFILE, type MockProfile } from './data/people';

export { MockHttpError, handlers, pinFor, detectLang, classify, analyze } from './handlers';
export type { MockCtx, MockHandler, MockHandlerFn } from './handlers';
export { buildDb, getDb, nowIso, nowMs, mockImage } from './db';
export { DEMO_USERS, DEMO_PASSWORD, GUEST_PROFILE, OFFICERS, OFFICER_FOR_USER } from './data/people';
export type { MockProfile } from './data/people';
export { DEPARTMENTS, deptById } from './data/departments';
export { WARDS, ZONES, wardById, nearestWard } from './data/wards';
export { EMERGENCY_CONTACTS, scanEmergency } from './data/emergency';
export { PHRASES } from './data/phrases';

// Handlers registered by portals (e.g. gov-shared/mocks) take precedence over the built-ins.
const extra: MockHandler[] = [];

/**
 * Additive hook: register or override a mock handler without editing this package.
 * `pattern` uses `:param` segments relative to `/api/v1`, e.g. `/officer/stats/:id`.
 */
export function registerMockHandler(method: 'GET' | 'POST', pattern: string, fn: MockHandlerFn) {
  extra.unshift({ method, pattern, fn });
}

function match(pattern: string, path: string): Record<string, string> | null {
  const ps = pattern.split('/').filter(Boolean);
  const xs = path.split('/').filter(Boolean);
  if (ps.length !== xs.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < ps.length; i++) {
    if (ps[i].startsWith(':')) params[ps[i].slice(1)] = decodeURIComponent(xs[i]);
    else if (ps[i] !== xs[i]) return null;
  }
  return params;
}

export function findMock(method: string, path: string): { handler: MockHandler; params: Record<string, string> } | null {
  const m = method.toUpperCase();
  for (const h of [...extra, ...handlers]) {
    if (h.method !== m) continue;
    const params = match(h.pattern, path);
    if (params) return { handler: h, params };
  }
  return null;
}

export const hasMock = (method: string, path: string) => findMock(method, path) !== null;

export function ensureDb() {
  if (!getDb()) buildDb();
}

/** Resolve a request against the mock layer. Throws MockHttpError on 4xx/5xx. */
export async function runMock(
  method: string,
  pathWithQuery: string,
  body: unknown,
  user: MockProfile | null,
): Promise<unknown> {
  ensureDb();
  const [path, qs = ''] = pathWithQuery.split('?');
  const found = findMock(method, path);
  if (!found) throw new MockHttpError(404, 'not_found', `No mock for ${method} ${path}`);
  const ctx: MockCtx = { method: method.toUpperCase(), path, params: found.params, query: new URLSearchParams(qs), body, user };
  const out = await found.handler.fn(ctx);
  // Deep-copy so callers (and the React Query cache) never hold live references into the mock db.
  return out === undefined ? out : JSON.parse(JSON.stringify(out));
}

export const profileForRole = (role: MockProfile['role']): MockProfile =>
  role === 'guest' ? GUEST_PROFILE : (DEMO_USERS.find((u) => u.role === role) ?? DEMO_USERS[0]);
