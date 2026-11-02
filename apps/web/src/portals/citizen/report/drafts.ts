// Unfinished report drafts (feature 36): the conversation is saved in IndexedDB after every turn and offered
// back as "Continue your unfinished complaint?" for 24 hours.
import { createStore, del, get, set } from 'idb-keyval';
import type { SessionSnapshot } from './useChatSession';

export interface SavedDraft {
  saved_at: string;
  snap: SessionSnapshot;
}

const store = createStore('jv-citizen', 'kv');
const KEY = 'report-draft';
const MAX_AGE_MS = 24 * 3600 * 1000;

export async function saveDraft(snap: SessionSnapshot) {
  try {
    // Fresh flags would re-animate restored messages; blob URLs don't survive a reload, so keep ids only.
    const messages = snap.messages.filter((m) => !m.error).map((m) => ({ ...m, fresh: false }));
    await set(KEY, { saved_at: new Date().toISOString(), snap: { ...snap, messages, media: [] } } satisfies SavedDraft, store);
  } catch {
    /* storage unavailable: drafts are a convenience */
  }
}

export async function loadDraft(): Promise<SavedDraft | null> {
  try {
    const d = await get<SavedDraft>(KEY, store);
    if (!d) return null;
    if (Date.now() - Date.parse(d.saved_at) > MAX_AGE_MS || !d.snap.messages.some((m) => m.role === 'user')) {
      await del(KEY, store);
      return null;
    }
    return d;
  } catch {
    return null;
  }
}

export async function clearDraft() {
  try {
    await del(KEY, store);
  } catch {
    /* ignore */
  }
}

/** Text the citizen typed so far (used to rebuild the server session on resume). */
export const userText = (snap: SessionSnapshot) =>
  snap.messages
    .filter((m) => m.role === 'user' && m.text && !m.text.startsWith('📍'))
    .map((m) => m.text)
    .join('. ');
