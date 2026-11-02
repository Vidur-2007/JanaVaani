// Live events (master §9 Realtime). Events are SIGNALS ONLY: we invalidate TanStack Query keys and
// refetch through the API; never render the payload. Supabase Realtime in hybrid/live, 20 s polling in mock mode.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { LiveEvent } from '@contracts/types';
import { API_MODE } from '@/lib/api/client';
import { qk } from '@/lib/api/endpoints';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth/useAuth';
import type { Profile } from '@/lib/auth/types';

export const MOCK_POLL_MS = 20_000;

// ---------------------------------------------------------------- tiny event bus (for toasts / "new item" glow)

type Listener = (e: LiveEvent) => void;
const listeners = new Set<Listener>();
let connection: 'connecting' | 'live' | 'polling' | 'offline' = 'connecting';
const connListeners = new Set<() => void>();
const setConnection = (c: typeof connection) => {
  connection = c;
  connListeners.forEach((l) => l());
};

/** Subscribe to live events (returns an unsubscribe function). */
export function onLiveEvent(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Component hook variant of `onLiveEvent`. */
export function useLiveEvent(cb: Listener) {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => onLiveEvent((e) => ref.current(e)), []);
}

/** 'live' (realtime connected), 'polling' (mock), 'connecting' or 'offline'. Drives `LiveIndicator`. */
export function useLiveConnection() {
  return useSyncExternalStore(
    (cb) => {
      connListeners.add(cb);
      return () => connListeners.delete(cb);
    },
    () => connection,
    () => connection,
  );
}

// ---------------------------------------------------------------- audiences + invalidation

export function audiencesFor(profile: Profile | null): string[] {
  const out = ['public'];
  if (!profile) return out;
  out.push(`user:${profile.id}`);
  if (profile.role === 'officer' && profile.department_id) out.push(`dept:${profile.department_id}`);
  if (profile.role === 'supervisor' || profile.role === 'admin') out.push('dept:*', 'role:admin');
  return out;
}

const matches = (audiences: string[], a: string) =>
  audiences.includes(a) || (a.startsWith('dept:') && audiences.includes('dept:*'));

export function invalidateFor(qc: QueryClient, e: LiveEvent) {
  switch (e.kind) {
    case 'notification':
      qc.invalidateQueries({ queryKey: qk.notifications.all });
      break;
    case 'alert':
      qc.invalidateQueries({ queryKey: qk.admin.alerts });
      break;
    default:
      qc.invalidateQueries({ queryKey: qk.grievances.all });
      qc.invalidateQueries({ queryKey: qk.officer.all });
      qc.invalidateQueries({ queryKey: qk.admin.all });
      if (e.audience === 'public') qc.invalidateQueries({ queryKey: qk.public.all });
  }
}

/** Mount once (in providers). */
export function useLiveEvents() {
  const qc = useQueryClient();
  const { profile, status } = useAuth();
  const [audiences, setAudiences] = useState<string[]>(['public']);

  useEffect(() => {
    setAudiences(audiencesFor(profile));
  }, [profile]);

  useEffect(() => {
    if (status === 'loading') return;
    const emit = (e: LiveEvent) => {
      if (!matches(audiences, e.audience)) return;
      invalidateFor(qc, e);
      listeners.forEach((l) => l(e));
    };

    // ---- Supabase Realtime (RLS limits rows to the caller's audiences)
    if (API_MODE !== 'mock' && supabase) {
      setConnection('connecting');
      const channel = supabase
        .channel('live_events')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_events' }, (payload) => emit(payload.new as LiveEvent))
        .subscribe((s) => setConnection(s === 'SUBSCRIBED' ? 'live' : s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' ? 'offline' : 'connecting'));
      return () => {
        supabase!.removeChannel(channel);
      };
    }

    // ---- Mock / no Supabase: poll the mock event log every 20 s
    setConnection('polling');
    let cursor = -1;
    let stopped = false;
    const tick = async () => {
      const m = await import('@mocks/index');
      if (stopped) return;
      m.ensureDb();
      const events = m.getDb().live_events;
      if (cursor === -1) cursor = events.length;
      const fresh = events.slice(cursor);
      cursor = events.length;
      fresh.forEach(emit);
      if (!fresh.length) {
        // Nothing new: still refresh time-based views (SLA countdowns, escalations).
        qc.invalidateQueries({ queryKey: qk.notifications.all });
      }
    };
    tick();
    const id = window.setInterval(tick, MOCK_POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [qc, audiences, status]);
}
