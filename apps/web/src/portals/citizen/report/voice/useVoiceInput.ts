// Microphone input for voice mode (Spec A §5.5):
// - getUserMedia → AnalyserNode → RMS level (drives the orb and silence detection);
// - known language + Web Speech → SpeechRecognition with live captions;
// - Auto-detect, no Web Speech, or a recognition failure → MediaRecorder → POST /speech/transcribe.
// The recorder always runs alongside Web Speech, so a stalled or failing recognizer never loses the turn:
// after the turn ends we wait up to RESOLVE_MS for a Web Speech transcript, else transcribe the recording.
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
const RESOLVE_MS = 1500; // how long to wait for Web Speech after the turn ends

interface Turn {
  id: number;
  active: boolean;
  spoke: boolean;
  quietSince: number;
  startedAt: number;
  finalText: string;
  interim: string;
  recDone: boolean;
  blob: Blob | null;
  delivered: boolean;
  timer: number;
}

export function useVoiceInput({ lang, onFinal, silenceMs = 1500, maxMs = 20_000 }: VoiceInputOptions) {
  const [status, setStatus] = useState<InputStatus>('idle');
  const [caption, setCaption] = useState('');
  const [engine, setEngine] = useState<Engine>('recorder');
  const levelRef = useRef(0);

  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<{ ctx: AudioContext; analyser: AnalyserNode; data: Float32Array<ArrayBuffer> } | null>(null);
  const rec = useRef<Recognition | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const raf = useRef(0);
  const turnSeq = useRef(0);
  const turn = useRef<Turn>({ id: 0, active: false, spoke: false, quietSince: 0, startedAt: 0, finalText: '', interim: '', recDone: true, blob: null, delivered: true, timer: 0 });
  const webSpeechBroken = useRef(false);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;
  const langRef = useRef(lang);
  langRef.current = lang;

  const ensureStream = useCallback(async () => {
    if (stream.current) return stream.current;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined')
      throw Object.assign(new Error('unsupported'), { name: 'NotSupportedError' });
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

  /** Decide the transcript for a finished turn (Web Speech text if any, else server transcription). */
  const resolveTurn = useCallback(async (t: Turn, force = false) => {
    if (t.delivered || t.active) return;
    const text = (t.finalText || t.interim).trim();
    const webDone = t.recDone || force;
    if (text && webDone) {
      t.delivered = true;
      window.clearTimeout(t.timer);
      setStatus('idle');
      onFinalRef.current(text, langRef.current === 'auto' ? undefined : langRef.current, 'webspeech');
      return;
    }
    if (!webDone || !t.blob) return; // still waiting for Web Speech or the recording
    t.delivered = true;
    window.clearTimeout(t.timer);
    if (!t.spoke && t.blob.size < 2000) {
      setStatus('idle');
      return;
    }
    setEngine('recorder');
    setStatus('transcribing');
    try {
      const res = await api.transcribe(t.blob, langRef.current === 'auto' ? undefined : langRef.current);
      if (turn.current.id !== t.id) return;
      setCaption(res.text);
      setStatus('idle');
      if (res.text.trim()) onFinalRef.current(res.text.trim(), res.language, 'recorder');
    } catch {
      setStatus('error');
    }
  }, []);

  /** End the current turn (silence, tap or time limit). */
  const finish = useCallback(() => {
    const t = turn.current;
    if (!t.active) return;
    t.active = false;
    stopMeter();
    rec.current?.stop();
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop();
    // Don't wait forever for a recognizer that never reports back.
    t.timer = window.setTimeout(() => resolveTurn(t, true), RESOLVE_MS);
  }, [resolveTurn]);

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
    const useWeb = langRef.current !== 'auto' && !!RecognitionCtor && !webSpeechBroken.current;
    const t: Turn = { id: ++turnSeq.current, active: true, spoke: false, quietSince: 0, startedAt: performance.now(), finalText: '', interim: '', recDone: !useWeb, blob: null, delivered: false, timer: 0 };
    turn.current = t;

    // Recorder: always on (fallback + Auto-detect path).
    const mime = pickRecorderMime();
    const r = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = () => {
      if (recorder.current === r) recorder.current = null;
      t.blob = new Blob(chunks, { type: r.mimeType || 'audio/webm' });
      resolveTurn(t);
    };
    recorder.current = r;
    r.start(250);

    // Web Speech: live captions in the chosen language.
    setEngine(useWeb ? 'webspeech' : 'recorder');
    if (useWeb) {
      const recog = new RecognitionCtor!();
      recog.lang = SPEECH_CODES[langRef.current as DeepLang] ?? 'en-IN';
      recog.interimResults = true;
      recog.continuous = true;
      recog.onresult = (e) => {
        let interim = '';
        let final = '';
        for (let i = 0; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) final += res[0].transcript + ' ';
          else interim += res[0].transcript;
        }
        t.finalText = final.trim();
        t.interim = interim.trim();
        setCaption(`${final}${interim}`.trim());
      };
      recog.onerror = (e) => {
        // Network/permission/unsupported-language failures: stop using Web Speech; the recording covers this turn.
        if (['network', 'not-allowed', 'service-not-allowed', 'language-not-supported'].includes(e.error)) webSpeechBroken.current = true;
      };
      recog.onend = () => {
        if (rec.current === recog) rec.current = null;
        t.recDone = true;
        if (t.active) {
          // The recognizer stopped on its own (it does after a pause): end the turn too.
          finish();
        } else resolveTurn(t);
      };
      rec.current = recog;
      try {
        recog.start();
      } catch {
        t.recDone = true;
        rec.current = null;
      }
    }

    setStatus('listening');
    meter();
  }, [ensureStream, finish, meter, resolveTurn]);

  /** Abort without delivering a transcript. */
  const cancel = useCallback(() => {
    const t = turn.current;
    t.active = false;
    t.delivered = true;
    window.clearTimeout(t.timer);
    stopMeter();
    if (rec.current) {
      const r = rec.current;
      rec.current = null;
      r.abort();
    }
    if (recorder.current && recorder.current.state !== 'inactive') {
      recorder.current.onstop = null;
      recorder.current.stop();
    }
    recorder.current = null;
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
