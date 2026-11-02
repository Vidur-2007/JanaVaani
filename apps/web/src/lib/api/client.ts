// fetch wrapper: bearer token, ApiError normalization, and mock | hybrid | live modes (master §9).
import { create } from 'zustand';
import type { ApiError } from '@contracts/types';
import type { MockProfile } from '@mocks/index';

export type ApiMode = 'mock' | 'hybrid' | 'live';

const env = import.meta.env;
const MODES: readonly string[] = ['mock', 'hybrid', 'live'];
export const API_MODE: ApiMode = (
  env.VITE_API_MODE && MODES.includes(env.VITE_API_MODE) ? env.VITE_API_MODE : 'mock'
) as ApiMode;
export const API_BASE: string = (env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1').replace(/\/$/, '');
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
  const res = await fetch(`${API_BASE}${pathWithQuery}`, { method, headers, body: payload, signal });
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

const shouldFallback = (e: unknown) =>
  e instanceof TypeError || (e instanceof ApiRequestError && (e.status === 404 || e.status === 501));

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
    if ((e as Error)?.name === 'AbortError' || !shouldFallback(e)) throw e;
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
export function errorMessage(e: unknown): string {
  if (e instanceof ApiRequestError) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}
