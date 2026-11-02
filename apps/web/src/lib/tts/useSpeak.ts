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
    (/google|microsoft/i.test(v.name) ? 0.25 : 0);
  const ranked = voices.filter((v) => v.lang.startsWith(base)).sort((a, b) => score(b) - score(a));
  return ranked[0] ?? null;
}

/** Whether a browser voice exists for the language (async; resolves after voices load). */
export async function hasBrowserVoice(lang: Lang) {
  return pickVoice(await loadVoices(), lang) !== null;
}

export function useSpeak() {
  const rate = usePrefs((s) => s.tts_rate);
  const [status, setStatus] = useState<SpeakStatus>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  const stop = useCallback(() => {
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
        const u = new SpeechSynthesisUtterance(text);
        u.voice = voice;
        u.lang = voice.lang;
        u.rate = rate;
        u.onstart = () => setStatus('speaking');
        u.onend = () => setStatus('idle');
        u.onerror = () => setStatus('error');
        synth.speak(u);
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
