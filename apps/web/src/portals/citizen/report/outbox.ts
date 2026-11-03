// Offline outbox (feature 212): complaints confirmed while offline are queued in IndexedDB and
// sent with POST /grievances when the connection returns. Works for both the chat and the quick report.
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { get, set, createStore } from 'idb-keyval';
import { toast } from 'sonner';
import { api, qk, type CreateGrievanceRequest } from '@/lib/api/endpoints';

export interface OutboxItem {
  id: string;
  body: CreateGrievanceRequest;
  /** Shown in the toast when it goes through. */
  title: string;
  queued_at: string;
  attempts: number;
}

const store = createStore('jv-citizen', 'kv');
const KEY = 'outbox';

export async function readOutbox(): Promise<OutboxItem[]> {
  try {
    return (await get<OutboxItem[]>(KEY, store)) ?? [];
  } catch {
    return [];
  }
}

async function writeOutbox(items: OutboxItem[]) {
  try {
    await set(KEY, items, store);
  } catch {
    /* storage blocked (private mode): nothing else we can do */
  }
}

export async function queueOutbox(body: CreateGrievanceRequest, title: string) {
  const items = await readOutbox();
  items.push({ id: `OB-${Date.now().toString(36)}`, body, title, queued_at: new Date().toISOString(), attempts: 0 });
  await writeOutbox(items);
  window.dispatchEvent(new Event('jv:outbox'));
}

let flushing = false;

/** Sends every queued complaint. Returns the ones that went through. */
export async function flushOutbox(): Promise<{ title: string; grievance_id: string; guest_pin?: string }[]> {
  if (flushing || !navigator.onLine) return [];
  flushing = true;
  try {
    const items = await readOutbox();
    const sent: { title: string; grievance_id: string; guest_pin?: string }[] = [];
    const remaining: OutboxItem[] = [];
    for (const it of items) {
      try {
        const r = await api.createGrievance(it.body);
        sent.push({ title: it.title, grievance_id: r.grievance.id, guest_pin: r.guest_pin });
      } catch {
        remaining.push({ ...it, attempts: it.attempts + 1 });
      }
    }
    await writeOutbox(remaining);
    return sent;
  } finally {
    flushing = false;
  }
}

/** Mount once in the citizen shell: flush on mount and whenever the browser comes back online. */
export function useOutboxFlush() {
  const qc = useQueryClient();
  const { t } = useTranslation('citizen');
  useEffect(() => {
    const run = async () => {
      const sent = await flushOutbox();
      if (!sent.length) return;
      qc.invalidateQueries({ queryKey: qk.grievances.all });
      for (const s of sent)
        toast.success(t('outbox.sent', { id: s.grievance_id }), {
          description: s.guest_pin ? t('outbox.sent_pin', { pin: s.guest_pin }) : s.title,
          duration: 12_000,
        });
    };
    run();
    window.addEventListener('online', run);
    return () => window.removeEventListener('online', run);
  }, [qc, t]);
}
