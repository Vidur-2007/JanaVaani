// Text-to-speech: best matching browser voice → server `/speech/tts` → 'unavailable'.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Lang } from '@contracts/types';
import { api } from '@/lib/api/endpoints';
import { SPEECH_CODES } from '@/lib/i18n';
import { usePrefs } from '@/lib/prefs/store';

export type SpeakStatus = 'idle' | 'loading' | 'speaking' | 'unavailable' | 'error';

const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!synth) return Promise.resolve([]);
  const now = synth.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(synth.getVoices());
    synth.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1200);
  });
}

/** Best voice for a language: exact `te-IN` → same language → none. Prefers local, then "Google"/"Microsoft" voices. */
export function pickVoice(voices: SpeechSynthesisVoice[], lang: Lang): SpeechSynthesisVoice | null {
  const code = SPEECH_CODES[lang as keyof typeof SPEECH_CODES] ?? 'en-IN';
  const base = code.slice(0, 2);
  const score = (v: SpeechSynthesisVoice) =>
    (v.lang.replace('_', '-') === code ? 4 : v.lang.startsWith(base) ? 2 : 0) +
    (v.localService ? 0.5 : 0) +
    (/google|microsoft/i.test(v.name) ? 0.25 : 0) +
    // P6: Edge's "Online (Natural)" voices (te-IN, hi-IN, ur-IN…) are far clearer than legacy local ones.
    (/natural/i.test(v.name) ? 1 : 0);
  const ranked = voices.filter((v) => v.lang.startsWith(base)).sort((a, b) => score(b) - score(a));
  return ranked[0] ?? null;
}

/** Whether a browser voice exists for the language (async; resolves after voices load). */
export async function hasBrowserVoice(lang: Lang) {
  return pickVoice(await loadVoices(), lang) !== null;
}

export type SpeakResult = 'done' | 'unavailable' | 'cancelled';

let currentAudio: HTMLAudioElement | null = null;

let speakSeq = 0;

/**
 * P6: Chrome stops Google network voices ~15 s into one utterance, so long replies are spoken sentence by
 * sentence (Latin . ? ! plus Devanagari । and Urdu ۔ full stops).
 */
function sentences(text: string): string[] {
  const parts = text.match(/[^.!?।۔\n]+[.!?।۔]*\s*/g)?.map((p) => p.trim()).filter(Boolean) ?? [text];
  const out: string[] = [];
  for (const p of parts) {
    const last = out[out.length - 1];
    if (last && last.length + p.length < 160) out[out.length - 1] = `${last} ${p}`;
    else out.push(p);
  }
  return out.length ? out : [text];
}

/** One utterance, with a watchdog: Android Chrome sometimes never fires `end`, which would stall voice mode. */
function speakOne(s: SpeechSynthesis, voice: SpeechSynthesisVoice, text: string, rate: number): Promise<SpeakResult> {
  return new Promise<SpeakResult>((resolve) => {
    let settled = false;
    const finish = (r: SpeakResult) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(watchdog);
      resolve(r);
    };
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = rate;
    u.onend = () => finish('done');
    u.onerror = (e) => finish(e.error === 'interrupted' || e.error === 'canceled' ? 'cancelled' : 'unavailable');
    // Generous estimate: ~8 characters per second at rate 1, plus start-up time for network voices.
    const watchdog = window.setTimeout(() => finish('done'), 4000 + (text.length / 8 / Math.max(rate, 0.5)) * 1000);
    if (s.paused) s.resume(); // Android can leave the queue paused after a backgrounded tab
    s.speak(u);
  });
}

/** Stop anything `speakText` is playing. */
export function cancelSpeech() {
  speakSeq++;
  synth?.cancel();
  currentAudio?.pause();
  currentAudio = null;
}

/**
 * Speak and resolve when finished (voice mode's turn-taking needs the end of speech).
 * Browser voice → server /speech/tts → 'unavailable' (no voice for this language on this device).
 */
export async function speakText(text: string, lang: Lang, rate = usePrefs.getState().tts_rate): Promise<SpeakResult> {
  cancelSpeech();
  if (!text.trim()) return 'done';
  const voice = pickVoice(await loadVoices(), lang);
  if (synth && voice) {
    const token = ++speakSeq;
    for (const part of sentences(text)) {
      if (token !== speakSeq) return 'cancelled';
      const r = await speakOne(synth, voice, part, rate);
      if (r !== 'done') return r;
    }
    return 'done';
  }
  try {
    const blob = await api.tts({ text, lang });
    if (!blob.type.startsWith('audio')) return 'unavailable';
    const url = URL.createObjectURL(blob);
    const a = new Audio(url);
    a.playbackRate = rate;
    currentAudio = a;
    return await new Promise<SpeakResult>((resolve) => {
      a.onended = () => {
        URL.revokeObjectURL(url);
        resolve('done');
      };
      a.onpause = () => resolve('cancelled');
      a.onerror = () => resolve('unavailable');
      a.play().catch(() => resolve('unavailable'));
    });
  } catch {
    return 'unavailable';
  }
}

export function useSpeak() {
  const rate = usePrefs((s) => s.tts_rate);
  const [status, setStatus] = useState<SpeakStatus>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  const stop = useCallback(() => {
    speakSeq++;
    synth?.cancel();
    audioRef.current?.pause();
    audioRef.current = null;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setStatus((s) => (s === 'unavailable' ? s : 'idle'));
  }, []);

  useEffect(() => stop, [stop]);

  const speak = useCallback(
    async (text: string, lang: Lang) => {
      stop();
      if (!text.trim()) return;
      const voice = pickVoice(await loadVoices(), lang);
      if (synth && voice) {
        // Sentence by sentence with a watchdog (see speakOne) — long status summaries hit Chrome's cut-off.
        const token = ++speakSeq;
        setStatus('speaking');
        for (const part of sentences(text)) {
          if (token !== speakSeq) return;
          const r = await speakOne(synth, voice, part, rate);
          if (r === 'cancelled') return;
          if (r === 'unavailable') return setStatus('error');
        }
        if (token === speakSeq) setStatus('idle');
        return;
      }
      // No browser voice → server TTS (501 when not configured).
      setStatus('loading');
      try {
        const blob = await api.tts({ text, lang });
        if (!blob.type.startsWith('audio')) throw new Error('not audio');
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        const audio = new Audio(url);
        audio.playbackRate = rate;
        audioRef.current = audio;
        audio.onended = () => setStatus('idle');
        await audio.play();
        setStatus('speaking');
      } catch {
        setStatus('unavailable');
      }
    },
    [rate, stop],
  );

  return { speak, stop, status, speaking: status === 'speaking', supported: !!synth };
}
