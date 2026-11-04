// fetch wrapper: bearer token, ApiError normalization, and mock | hybrid | live modes (master §9).
import i18n from 'i18next';
import { create } from 'zustand';
import type { ApiError } from '@contracts/types';
import type { MockProfile } from '@mocks/index';

export type ApiMode = 'mock' | 'hybrid' | 'live';

const env = import.meta.env;
const MODES: readonly string[] = ['mock', 'hybrid', 'live'];
export const API_MODE: ApiMode = (
  env.VITE_API_MODE && MODES.includes(env.VITE_API_MODE) ? env.VITE_API_MODE : 'mock'
) as ApiMode;
const RAW_API_BASE = (env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1').replace(/\/$/, '');
/**
 * Absolute API base. A same-origin path (`/api/v1`, used when web and API share one Vercel domain) is resolved
 * against the page origin, so `new URL(x, API_BASE)` and `new URL(API_BASE)` keep working everywhere.
 */
export const API_BASE: string =
  RAW_API_BASE.startsWith('/') && typeof window !== 'undefined'
    ? `${window.location.origin}${RAW_API_BASE}`
    : RAW_API_BASE;
export const DEMO_MODE: boolean = String(env.VITE_DEMO_MODE ?? 'true') === 'true';

/** Normalized error thrown by every API call. */
export class ApiRequestError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// ---------------------------------------------------------------- auth bridge (set by AuthProvider)

interface AuthBridge {
  getToken: () => Promise<string | null>;
  getMockUser: () => MockProfile | null;
}
const bridge: AuthBridge = { getToken: async () => null, getMockUser: () => null };
export function setAuthBridge(b: Partial<AuthBridge>) {
  Object.assign(bridge, b);
}

// ---------------------------------------------------------------- fallback counter (hybrid badge)

interface FallbackState {
  count: number;
  paths: Record<string, number>;
  record: (path: string) => void;
}
export const useMockFallbacks = create<FallbackState>((set) => ({
  count: 0,
  paths: {},
  record: (path) =>
    set((s) => ({ count: s.count + 1, paths: { ...s.paths, [path]: (s.paths[path] ?? 0) + 1 } })),
}));

// ---------------------------------------------------------------- mock execution

let mockModule: Promise<typeof import('@mocks/index')> | null = null;
const loadMocks = () => (mockModule ??= import('@mocks/index'));

const latency = () => 300 + Math.floor(Math.random() * 600);
const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });

async function viaMock<T>(
  method: string,
  pathWithQuery: string,
  body: unknown,
  signal?: AbortSignal,
  raw?: boolean,
): Promise<T> {
  const m = await loadMocks();
  await sleep(latency(), signal);
  try {
    const out = await m.runMock(method, pathWithQuery, body, bridge.getMockUser());
    if (raw) return new Blob([JSON.stringify(out)], { type: 'application/json' }) as T;
    return out as T;
  } catch (e) {
    if (e instanceof m.MockHttpError) throw new ApiRequestError(e.status, e.code, e.message);
    throw e;
  }
}

// ---------------------------------------------------------------- live execution

async function viaLive<T>(
  method: string,
  pathWithQuery: string,
  body: unknown,
  signal?: AbortSignal,
  raw?: boolean,
): Promise<T> {
  const headers: Record<string, string> = { Accept: raw ? '*/*' : 'application/json' };
  const token = await bridge.getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined && body !== null) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  // P6: never hang on a sleeping API (free HF Spaces cold-start in 30 s+). Our own timeout becomes a
  // `timeout` ApiRequestError (hybrid falls back to mocks); the caller's abort still propagates as AbortError.
  const ctrl = new AbortController();
  const limit = timeoutFor(method, pathWithQuery);
  const timer = setTimeout(() => ctrl.abort(), limit);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${pathWithQuery}`, { method, headers, body: payload, signal: ctrl.signal });
  } catch (e) {
    if (ctrl.signal.aborted && !signal?.aborted) throw new ApiRequestError(0, 'timeout', `Timed out after ${limit} ms`);
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
  if (!res.ok) {
    let err: ApiError | undefined;
    try {
      err = (await res.json()) as ApiError;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiRequestError(
      res.status,
      err?.error?.code ?? `http_${res.status}`,
      err?.error?.message ?? res.statusText,
      err?.error?.details,
    );
  }
  if (raw) return (await res.blob()) as T;
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Per-request time limits: uploads and speech carry audio/images; chat and analysis call LLMs. */
function timeoutFor(method: string, path: string): number {
  if (/^\/(uploads|speech\/transcribe)/.test(path)) return 45_000;
  if (method === 'POST') return 25_000;
  return 12_000;
}

const shouldFallback = (e: unknown, hadToken: boolean) =>
  e instanceof TypeError ||
  (e instanceof ApiRequestError && e.code === 'timeout') ||
  (e instanceof ApiRequestError &&
    (e.status === 404 ||
      e.status === 501 ||
      // P6: a token-less session (mock sign-in, API without auth) gets 401 on user-scoped routes.
      // Hybrid must not show broken UI for that; with a real token a 401 is a genuine error.
      (e.status === 401 && !hadToken)));

// ---------------------------------------------------------------- public API

export type Query = Record<string, string | number | boolean | null | undefined | string[]>;

export function buildQuery(q?: Query): string {
  if (!q) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === '') continue;
    p.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
  /** Return a Blob instead of parsed JSON (e.g. /speech/tts audio). */
  raw?: boolean;
  /** Force a mode for this call. */
  mode?: ApiMode;
}

export async function request<T>(
  method: 'GET' | 'POST',
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const full = `${path}${buildQuery(opts.query)}`;
  const mode = opts.mode ?? API_MODE;
  if (mode === 'mock') return viaMock<T>(method, full, opts.body, opts.signal, opts.raw);
  if (mode === 'live') return viaLive<T>(method, full, opts.body, opts.signal, opts.raw);
  try {
    return await viaLive<T>(method, full, opts.body, opts.signal, opts.raw);
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    const hadToken = !!(await bridge.getToken().catch(() => null));
    if (!shouldFallback(e, hadToken)) throw e;
    console.info('[mock-fallback]', path);
    useMockFallbacks.getState().record(path);
    return viaMock<T>(method, full, opts.body, opts.signal, opts.raw);
  }
}

export const get = <T>(path: string, query?: Query, signal?: AbortSignal) =>
  request<T>('GET', path, { query, signal });
export const post = <T>(path: string, body?: unknown, query?: Query) =>
  request<T>('POST', path, { body: body ?? {}, query });

/** Human-readable message for any thrown error. */
/** HTTP status → friendly, translated message key (common:errors.*). P5: citizens never see raw server text. */
function friendlyKey(e: unknown): string | null {
  if (e instanceof ApiRequestError) {
    const s = e.status;
    if (s === 0 || e.code === 'network_error' || e.code === 'timeout') return 'network';
    if (s === 401) return 'unauthorized';
    if (s === 403) return 'forbidden';
    if (s === 404) return 'not_found';
    if (s === 409) return 'conflict';
    if (s === 413) return 'too_large';
    if (s === 429) return 'rate_limited';
    if (s === 400 || s === 422) return 'invalid';
    if (s >= 500) return 'server';
    return null;
  }
  if (e instanceof TypeError && /fetch|network|load failed/i.test(e.message)) return 'network';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'network';
  return null;
}

export function errorMessage(e: unknown): string {
  const key = friendlyKey(e);
  if (key && i18n.isInitialized) {
    const text = i18n.t(`errors.${key}`, { ns: 'common', defaultValue: '' });
    if (text) return text;
  }
  if (e instanceof Error) return e.message;
  return String(e);
}

/**
 * P6: media URLs from B's offline mode are relative to the API host (`/api/v1/uploads/{id}`).
 * Resolve them against the API origin so <img> doesn't hit the frontend host. Absolute, data: and blob:
 * URLs pass through unchanged, so it is safe to apply more than once.
 */
export function mediaUrl(url: string | undefined | null): string {
  if (!url) return '';
  if (/^(https?:|data:|blob:)/i.test(url) || !url.startsWith('/')) return url;
  try {
    return new URL(url, new URL(API_BASE).origin).toString();
  } catch {
    return url;
  }
}
