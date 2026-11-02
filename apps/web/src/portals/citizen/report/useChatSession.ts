// Conversation state for the report assistant. Every turn goes through POST /chat/turn; the UI follows response.stage.
import { useCallback, useRef, useState } from 'react';
import type { ChatTurnRequest, ChatTurnResponse, DeepLang, Grievance, Lang, Location, Media } from '@contracts/types';
import { api } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/api/client';
import { detectScript } from '@/lib/detectScript';
import { isRtl } from '@/lib/i18n';

export type Stage = ChatTurnResponse['stage'];

export interface ChatMessage {
  id: string;
  role: 'user' | 'bot';
  text: string;
  /** English version of a bot reply (for the "Show in English" affordance). */
  en?: string;
  lang: string;
  dir: 'ltr' | 'rtl';
  media?: Media[];
  /** Animate (word-by-word reveal) only for fresh bot replies, never for restored history. */
  fresh?: boolean;
  tracked?: Grievance[];
  error?: boolean;
}

export interface SessionSnapshot {
  session_id?: string;
  messages: ChatMessage[];
  response?: ChatTurnResponse;
  location?: Location;
  media: Media[];
  asset_id?: string;
}

let seq = 0;
const mid = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

const ACTIONS = new Set(['confirm', 'edit', 'cancel', 'split_confirm', 'support_existing', 'file_new_anyway', 'continue_after_emergency']);
export const isActionValue = (v: string) => ACTIONS.has(v);

export interface SendOptions {
  text?: string;
  /** What to show in the user's bubble (e.g. a quick-reply label); defaults to `text`. */
  display?: string;
  action?: ChatTurnRequest['action'];
  action_payload?: Record<string, unknown>;
  input_mode?: 'text' | 'voice';
  submit_options?: ChatTurnRequest['submit_options'];
  /** Don't echo a user bubble (used when resuming a draft). */
  silent?: boolean;
}

export function useChatSession(opts: { uiLang: DeepLang; initial?: SessionSnapshot; greeting: string }) {
  const [snap, setSnap] = useState<SessionSnapshot>(
    () =>
      opts.initial ?? {
        messages: [{ id: mid(), role: 'bot', text: opts.greeting, lang: opts.uiLang, dir: isRtl(opts.uiLang) ? 'rtl' : 'ltr', fresh: false }],
        media: [],
      },
  );
  const [pending, setPending] = useState(false);
  const [maxMissing, setMaxMissing] = useState(0);
  const lastRequest = useRef<SendOptions | null>(null);
  const snapRef = useRef(snap);
  snapRef.current = snap;

  const send = useCallback(
    async (o: SendOptions) => {
      const cur = snapRef.current;
      lastRequest.current = o;
      const shown = o.display ?? o.text;
      const userMsg: ChatMessage | null =
        !o.silent && (shown || cur.media.length)
          ? (() => {
              const s = detectScript(shown ?? '');
              return { id: mid(), role: 'user', text: shown ?? '', lang: s.lang, dir: s.rtl ? 'rtl' : 'ltr', media: cur.media.length ? cur.media : undefined };
            })()
          : null;
      setSnap((p) => ({ ...p, messages: userMsg ? [...p.messages.filter((m) => !m.error), userMsg] : p.messages.filter((m) => !m.error) }));
      setPending(true);
      try {
        const res = await api.chatTurn({
          session_id: cur.session_id,
          text: o.text,
          input_mode: o.input_mode ?? 'text',
          ui_lang: opts.uiLang,
          lang_hint: o.text ? (detectScript(o.text).lang as Lang) : undefined,
          media_ids: cur.media.length ? cur.media.map((m) => m.id) : undefined,
          location: cur.location,
          asset_id: cur.asset_id,
          action: o.action,
          action_payload: o.action_payload,
          submit_options: o.submit_options,
        });
        setMaxMissing((m) => Math.max(m, res.missing_fields.length));
        const botMsg: ChatMessage = {
          id: mid(),
          role: 'bot',
          text: res.reply.original,
          en: res.reply.en,
          lang: res.reply.lang,
          dir: isRtl(res.reply.lang) ? 'rtl' : 'ltr',
          fresh: true,
          tracked: res.tracked?.length ? res.tracked : undefined,
        };
        setSnap((p) => ({
          ...p,
          session_id: res.session_id,
          response: res,
          // Attachments and location travel with the turn they were sent in.
          media: [],
          location: res.draft?.location ?? p.location,
          messages: [...p.messages, botMsg],
        }));
        return res;
      } catch (e) {
        setSnap((p) => ({
          ...p,
          messages: [...p.messages, { id: mid(), role: 'bot', text: errorMessage(e), lang: 'en', dir: 'ltr', error: true }],
        }));
        return null;
      } finally {
        setPending(false);
      }
    },
    [opts.uiLang],
  );

  const retry = useCallback(() => {
    const last = lastRequest.current;
    if (last) send({ ...last, silent: true });
  }, [send]);

  const attachMedia = useCallback((m: Media) => setSnap((p) => ({ ...p, media: [...p.media.filter((x) => x.id !== m.id), m] })), []);
  const removeMedia = useCallback((id: string) => setSnap((p) => ({ ...p, media: p.media.filter((x) => x.id !== id) })), []);
  const setLocation = useCallback((l: Location | undefined) => setSnap((p) => ({ ...p, location: l })), []);
  const setAsset = useCallback((asset_id: string | undefined) => setSnap((p) => ({ ...p, asset_id })), []);
  const reset = useCallback(() => {
    setMaxMissing(0);
    setSnap({
      messages: [{ id: mid(), role: 'bot', text: opts.greeting, lang: opts.uiLang, dir: isRtl(opts.uiLang) ? 'rtl' : 'ltr' }],
      media: [],
    });
  }, [opts.greeting, opts.uiLang]);
  /** Mark all messages as seen (no re-animation after re-render). */
  const settle = useCallback((id: string) => setSnap((p) => ({ ...p, messages: p.messages.map((m) => (m.id === id ? { ...m, fresh: false } : m)) })), []);

  const res = snap.response;
  return {
    snap,
    setSnap,
    stage: (res?.stage ?? 'collecting') as Stage,
    response: res,
    pending,
    maxMissing,
    send,
    retry,
    attachMedia,
    removeMedia,
    setLocation,
    setAsset,
    reset,
    settle,
  };
}

export type ChatSession = ReturnType<typeof useChatSession>;
