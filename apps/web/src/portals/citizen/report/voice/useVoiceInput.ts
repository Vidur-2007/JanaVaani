// Microphone input for voice mode (Spec A §5.5):
// - getUserMedia → AnalyserNode → RMS level (drives the orb and silence detection);
// - known language + Web Speech → SpeechRecognition with live captions;
// - Auto-detect, no Web Speech, or a recognition error → MediaRecorder → POST /speech/transcribe.
// A turn ends after `silenceMs` of quiet following speech, on stop() (tap), or after `maxMs`.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DeepLang, Lang } from '@contracts/types';
import { api } from '@/lib/api/endpoints';
import { SPEECH_CODES } from '@/lib/i18n';
import { pickRecorderMime, RecognitionCtor, type Recognition } from './speech';

export type VoiceLang = DeepLang | 'auto';
export type InputStatus = 'idle' | 'requesting' | 'listening' | 'transcribing' | 'denied' | 'unsupported' | 'error';
export type Engine = 'webspeech' | 'recorder';

export interface VoiceInputOptions {
  lang: VoiceLang;
  onFinal: (text: string, language: Lang | undefined, engine: Engine) => void;
  silenceMs?: number;
  maxMs?: number;
}

const SPEAK_LEVEL = 0.09; // level that counts as speech
const QUIET_LEVEL = 0.05; // level that counts as silence

export function useVoiceInput({ lang, onFinal, silenceMs = 1500, maxMs = 20_000 }: VoiceInputOptions) {
  const [status, setStatus] = useState<InputStatus>('idle');
  const [caption, setCaption] = useState('');
  const [engine, setEngine] = useState<Engine>('recorder');
  const levelRef = useRef(0);

  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<{ ctx: AudioContext; analyser: AnalyserNode; data: Float32Array<ArrayBuffer> } | null>(null);
  const rec = useRef<Recognition | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const raf = useRef(0);
  const turn = useRef({ active: false, spoke: false, quietSince: 0, startedAt: 0, finalText: '', interim: '' });
  const webSpeechBroken = useRef(false);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  const ensureStream = useCallback(async () => {
    if (stream.current) return stream.current;
    if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('unsupported'), { name: 'NotSupportedError' });
    const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    stream.current = s;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(s).connect(analyser);
    audio.current = { ctx, analyser, data: new Float32Array(new ArrayBuffer(analyser.fftSize * 4)) };
    return s;
  }, []);

  const stopMeter = () => {
    cancelAnimationFrame(raf.current);
    levelRef.current = 0;
  };

  /** End the current turn: stop the engine; the transcript is delivered by the engine's end handler. */
  const finish = useCallback(() => {
    const t = turn.current;
    if (!t.active) return;
    t.active = false;
    stopMeter();
    if (rec.current) rec.current.stop();
    else if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop();
  }, []);

  const meter = useCallback(() => {
    const a = audio.current;
    if (!a) return;
    const loop = () => {
      a.analyser.getFloatTimeDomainData(a.data);
      let sum = 0;
      for (let i = 0; i < a.data.length; i++) sum += a.data[i] * a.data[i];
      const level = Math.min(1, Math.sqrt(sum / a.data.length) * 6);
      levelRef.current = level;
      const t = turn.current;
      const now = performance.now();
      if (t.active) {
        if (level > SPEAK_LEVEL) {
          t.spoke = true;
          t.quietSince = 0;
        } else if (t.spoke && level < QUIET_LEVEL) {
          t.quietSince ||= now;
          if (now - t.quietSince > silenceMs) return finish();
        }
        if (now - t.startedAt > maxMs) return finish();
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
  }, [finish, silenceMs, maxMs]);

  const startRecorder = useCallback(
    (s: MediaStream) => {
      setEngine('recorder');
      const mime = pickRecorderMime();
      const r = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = async () => {
        recorder.current = null;
        const blob = new Blob(chunks.current, { type: r.mimeType || 'audio/webm' });
        if (!turn.current.spoke && blob.size < 2000) {
          setStatus('idle');
          return;
        }
        setStatus('transcribing');
        try {
          const res = await api.transcribe(blob, lang === 'auto' ? undefined : lang);
          setCaption(res.text);
          setStatus('idle');
          if (res.text.trim()) onFinalRef.current(res.text.trim(), res.language, 'recorder');
        } catch {
          setStatus('error');
        }
      };
      recorder.current = r;
      r.start(250);
    },
    [lang],
  );

  const startWebSpeech = useCallback(
    (s: MediaStream) => {
      setEngine('webspeech');
      const r = new RecognitionCtor!();
      r.lang = SPEECH_CODES[lang as DeepLang] ?? 'en-IN';
      r.interimResults = true;
      r.continuous = true;
      r.onresult = (e) => {
        let interim = '';
        let final = '';
        for (let i = 0; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) final += res[0].transcript + ' ';
          else interim += res[0].transcript;
        }
        turn.current.finalText = final.trim();
        turn.current.interim = interim.trim();
        turn.current.spoke = true;
        setCaption(`${final}${interim}`.trim());
      };
      r.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          rec.current = null;
          webSpeechBroken.current = true;
          // The mic itself works (we have a stream); fall back to recording for this turn.
          if (turn.current.active) startRecorder(s);
        } else if (e.error === 'network' || e.error === 'language-not-supported') {
          webSpeechBroken.current = true;
          rec.current = null;
          if (turn.current.active) startRecorder(s);
        }
      };
      r.onend = () => {
        if (rec.current !== r) return; // replaced by the recorder fallback
        rec.current = null;
        const text = (turn.current.finalText || turn.current.interim).trim();
        turn.current.active = false;
        stopMeter();
        setStatus('idle');
        if (text) onFinalRef.current(text, lang === 'auto' ? undefined : lang, 'webspeech');
      };
      rec.current = r;
      r.start();
    },
    [lang, startRecorder],
  );

  /** Start a listening turn (asks for the mic on first use). */
  const start = useCallback(async () => {
    if (turn.current.active) return;
    setCaption('');
    setStatus('requesting');
    let s: MediaStream;
    try {
      s = await ensureStream();
      await audio.current?.ctx.resume();
    } catch (e) {
      const name = (e as Error).name;
      setStatus(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : name === 'NotSupportedError' ? 'unsupported' : 'error');
      return;
    }
    turn.current = { active: true, spoke: false, quietSince: 0, startedAt: performance.now(), finalText: '', interim: '' };
    setStatus('listening');
    meter();
    if (lang !== 'auto' && RecognitionCtor && !webSpeechBroken.current) startWebSpeech(s);
    else startRecorder(s);
  }, [ensureStream, lang, meter, startRecorder, startWebSpeech]);

  /** Abort without delivering a transcript. */
  const cancel = useCallback(() => {
    turn.current.active = false;
    stopMeter();
    if (rec.current) {
      const r = rec.current;
      rec.current = null;
      r.abort();
    }
    if (recorder.current && recorder.current.state !== 'inactive') {
      recorder.current.onstop = null;
      recorder.current.stop();
      recorder.current = null;
    }
    setStatus('idle');
  }, []);

  // Release the microphone when voice mode closes.
  useEffect(
    () => () => {
      cancel();
      stream.current?.getTracks().forEach((tr) => tr.stop());
      stream.current = null;
      audio.current?.ctx.close().catch(() => undefined);
      audio.current = null;
    },
    [cancel],
  );

  return { status, caption, engine, levelRef, start, stop: finish, cancel };
}
