// Voice mode (Spec A §5.5): full-screen Voice Orb, voice-to-voice loop.
// listen → (silence 1.5 s or tap) → /chat/turn with input_mode 'voice' → speak the reply in its language → listen again.
// At `confirming`, yes/no words confirm or edit. Emergency, duplicates and submitted hand over to the normal UI.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Check, Keyboard, Mic, Pencil, VolumeX, X } from 'lucide-react';
import type { DeepLang, Lang } from '@contracts/types';
import { Button } from '@/design/ui/button';
import { AIBadge } from '@/design/components';
import { isRtl, LANGUAGE_NAMES } from '@/lib/i18n';
import { usePrefs } from '@/lib/prefs/store';
import { cancelSpeech, speakText } from '@/lib/tts/useSpeak';
import type { ChatSession } from '../useChatSession';
import { Orb, type OrbState } from './Orb';
import { useVoiceInput, type VoiceLang } from './useVoiceInput';
import { VoiceLangChip } from './VoiceLangChip';
import { matchConfirmWord } from './voiceWords';
import { useBackToClose } from '../../components/useBackToClose';
import { DEMO_MODE } from '@/lib/api/client';
import { DEMO_KUKATPALLY, DEMO_PHRASES } from '../../demo/demoKit';

type Phase = 'consent' | 'ready' | 'listening' | 'thinking' | 'speaking' | 'denied' | 'unsupported';

const HANDOVER = new Set(['emergency', 'duplicate_check', 'submitted']);
const TIP_KEY = 'jv.voice.noTtsTip';

export function VoiceMode({
  chat,
  uiLang,
  onClose,
  onEdit,
}: {
  chat: ChatSession;
  uiLang: DeepLang;
  onClose: () => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation('citizen');
  const prefs = usePrefs();
  const [vlang, setVlang] = useState<VoiceLang>(uiLang);
  const [phase, setPhase] = useState<Phase>(prefs.consent_microphone === true ? 'ready' : 'consent');
  const [noVoice, setNoVoice] = useState<string | null>(null);
  const [tipShown] = useState(() => {
    try {
      return localStorage.getItem(TIP_KEY) === '1';
    } catch {
      return false;
    }
  });
  // The reply already on screen when voice mode opens is not re-spoken.
  const lastSpoken = useRef<unknown>(chat.response);
  const looping = useRef(true);

  const stage = chat.stage;
  const res = chat.response;

  const onFinal = useCallback(
    (text: string) => {
      setPhase('thinking');
      if (chat.stage === 'confirming') {
        const word = matchConfirmWord(text);
        if (word === 'yes') {
          chat.send({
            action: 'confirm',
            display: text,
            input_mode: 'voice',
            submit_options: { is_anonymous: usePrefs.getState().anonymous_default, is_private: false },
          });
          return;
        }
        if (word === 'no') {
          onEdit();
          return;
        }
      }
      chat.send({ text, input_mode: 'voice' });
    },
    [chat, onEdit],
  );

  const input = useVoiceInput({ lang: vlang, onFinal });
  useBackToClose('voice', onClose);
  // Stable callbacks (the hook returns a new object every render).
  const { start: startInput, stop: stopInput, cancel: cancelInput } = input;

  // Microphone failures.
  useEffect(() => {
    if (input.status === 'denied') setPhase('denied');
    else if (input.status === 'unsupported') setPhase('unsupported');
    else if (input.status === 'listening') setPhase('listening');
    else if (input.status === 'transcribing') setPhase('thinking');
    else if (input.status === 'error') setPhase('ready');
    // P6: a turn that produced nothing (no speech, empty recording) must not leave the UI stuck on
    // "Listening…": show "tap to speak" again. A delivered transcript moves on to "thinking" right after.
    else if (input.status === 'idle') setPhase((p) => (p === 'listening' ? 'ready' : p));
  }, [input.status]);

  const listen = useCallback(() => {
    cancelSpeech();
    looping.current = true;
    startInput();
  }, [startInput]);

  // When a new reply arrives: speak it in its language, then listen again (or hand over).
  useEffect(() => {
    if (!res || chat.pending || lastSpoken.current === res) return;
    lastSpoken.current = res;
    if (HANDOVER.has(res.stage)) {
      onClose();
      return;
    }
    let alive = true;
    setPhase('speaking');
    (async () => {
      const lang = res.reply.lang as Lang;
      const result = await speakText(res.reply.original, lang);
      if (result === 'unavailable') setNoVoice(LANGUAGE_NAMES[lang]?.native ?? lang);
      if (res.stage === 'confirming' && alive && result !== 'cancelled')
        await speakText(t('voice.say_yes'), uiLang);
      if (!alive) return;
      if (looping.current) listen();
      else setPhase('ready');
    })();
    return () => {
      alive = false;
    };
  }, [res, chat.pending, onClose, listen, t, uiLang]);

  useEffect(() => {
    if (chat.pending) setPhase('thinking');
  }, [chat.pending]);

  // Close on Escape; stop speech when leaving.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      cancelSpeech();
    };
  }, [onClose]);

  const tapOrb = () => {
    if (phase === 'listening') stopInput();
    else if (phase === 'speaking') {
      cancelSpeech();
      listen();
    } else if (phase === 'ready') listen();
  };

  const orbState: OrbState =
    phase === 'listening'
      ? 'listening'
      : phase === 'thinking'
        ? 'thinking'
        : phase === 'speaking'
          ? 'speaking'
          : 'idle';
  const lastBot = [...chat.snap.messages].reverse().find((m) => m.role === 'bot' && !m.error);
  const lastUser = [...chat.snap.messages].reverse().find((m) => m.role === 'user');
  const caption = input.caption || lastUser?.text;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('voice.title')}
      className="fixed inset-0 z-[90] flex flex-col overflow-y-auto pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] bg-[radial-gradient(80%_60%_at_50%_35%,#131a2c,#070a12)] text-white"
      data-testid="voice-mode"
    >
      <header className="flex items-center justify-between gap-2 p-4">
        <Button
          variant="ghost"
          className="touch-target text-white hover:bg-white/10 hover:text-white"
          onClick={onClose}
          data-testid="voice-close"
        >
          <Keyboard className="size-5" aria-hidden />
          {t('voice.type_instead')}
        </Button>
        <VoiceLangChip
          value={vlang}
          onChange={(v) => {
            cancelInput();
            setVlang(v);
            setPhase('ready');
          }}
          disabled={phase === 'thinking'}
        />
        <Button
          variant="ghost"
          size="icon"
          className="touch-target text-white hover:bg-white/10 hover:text-white"
          onClick={onClose}
          aria-label={t('voice.close')}
        >
          <X className="size-5" aria-hidden />
        </Button>
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center gap-5 px-5 pb-8">
        {phase === 'consent' ? (
          <div
            className="mt-10 space-y-4 rounded-3xl bg-white/8 p-6 text-center ring-1 ring-white/15"
            data-testid="mic-preprompt"
          >
            <div className="mx-auto grid size-16 place-items-center rounded-full bg-[#FF7A1A]/20">
              <Mic className="size-8 text-[#FFC23D]" aria-hidden />
            </div>
            <h2 className="font-display text-xl font-semibold">{t('voice.consent_title')}</h2>
            <p className="text-sm leading-relaxed text-white/80">{t('voice.consent_body')}</p>
            <Button
              className="touch-target h-12 w-full text-base"
              onClick={() => {
                prefs.set({ consent_microphone: true });
                listen();
              }}
              data-testid="mic-allow"
            >
              {t('voice.consent_allow')}
            </Button>
            <Button
              variant="ghost"
              className="w-full text-white hover:bg-white/10 hover:text-white"
              onClick={onClose}
            >
              {t('voice.type_instead')}
            </Button>
          </div>
        ) : phase === 'denied' || phase === 'unsupported' ? (
          <div
            className="mt-10 space-y-4 rounded-3xl bg-white/8 p-6 text-center ring-1 ring-white/15"
            role="alert"
            data-testid="mic-denied"
          >
            <h2 className="font-display text-xl font-semibold">
              {phase === 'denied' ? t('voice.denied_title') : t('voice.unsupported_title')}
            </h2>
            <p className="text-sm text-white/80">
              {phase === 'denied' ? t('voice.denied_body') : t('voice.unsupported_body')}
            </p>
            <Button className="touch-target h-12 w-full" onClick={onClose}>
              <Keyboard className="size-5" aria-hidden />
              {t('voice.type_instead')}
            </Button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={tapOrb}
              disabled={phase === 'thinking'}
              className="relative mt-2 size-[min(70vw,300px)] rounded-full outline-offset-8 focus-visible:outline-2 focus-visible:outline-white"
              aria-label={
                phase === 'listening'
                  ? t('voice.tap_stop')
                  : phase === 'speaking'
                    ? t('voice.tap_skip')
                    : t('voice.tap_speak')
              }
              data-testid="voice-orb-button"
            >
              <Orb levelRef={input.levelRef} state={orbState} className="size-full" />
            </button>

            <p
              className="text-sm font-medium tracking-wide text-white/70 uppercase"
              aria-live="polite"
              data-testid="voice-status"
              data-phase={phase}
            >
              {t(`voice.status.${phase}`)}
            </p>

            {/* P7 demo mode: stage fallback when the room mic fails — sends the rehearsed Telugu phrase as the voice turn. */}
            {DEMO_MODE && !chat.response && phase !== 'thinking' && (
              <button
                type="button"
                className="jv-press min-h-9 rounded-full border border-dashed border-white/30 px-3 text-xs font-medium text-white/70 hover:text-white"
                onClick={() => {
                  cancelInput();
                  chat.setLocation(DEMO_KUKATPALLY);
                  onFinal(DEMO_PHRASES.live_wire.text);
                }}
                data-testid="demo-voice-phrase"
              >
                {t('demo.voice_phrase')}
              </button>
            )}

            {caption && (
              <p
                className="max-w-md text-center text-lg leading-relaxed text-white/90"
                dir="auto"
                data-testid="voice-caption"
              >
                “{caption}”
              </p>
            )}

            {lastBot && (
              <div
                className="w-full space-y-2 rounded-3xl bg-white/8 p-5 ring-1 ring-white/10"
                aria-live="polite"
              >
                <p
                  className="text-xl leading-relaxed"
                  lang={lastBot.lang}
                  dir={isRtl(lastBot.lang) ? 'rtl' : 'ltr'}
                  data-testid="voice-reply"
                >
                  {lastBot.text}
                </p>
                <AIBadge variant="generated" className="border-white/20 bg-white/10 text-white" />
              </div>
            )}

            {noVoice && !tipShown && (
              <p
                className="flex w-full items-start gap-2 rounded-2xl bg-[#FFC23D]/15 p-3 text-sm text-[#FFE6A8]"
                role="status"
                data-testid="no-voice-tip"
              >
                <VolumeX className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  {t('voice.no_voice', { lang: noVoice })}{' '}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      try {
                        localStorage.setItem(TIP_KEY, '1');
                      } catch {
                        /* ignore */
                      }
                      setNoVoice(null);
                    }}
                  >
                    {t('voice.got_it')}
                  </button>
                </span>
              </p>
            )}

            {stage === 'confirming' && (
              <div className="w-full space-y-3 text-center" data-testid="voice-confirm">
                <p className="text-sm text-white/80">{t('voice.say_yes')}</p>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    className="h-16 rounded-2xl bg-[#2BD67B] text-lg text-[#052e16] hover:bg-[#2BD67B]/90"
                    onClick={() => onFinal('yes')}
                    disabled={chat.pending}
                    aria-label={t('confirm.submit')}
                  >
                    <Check className="size-7" aria-hidden />
                  </Button>
                  <Button
                    variant="outline"
                    className="h-16 rounded-2xl border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
                    onClick={onEdit}
                    aria-label={t('voice.edit')}
                  >
                    <Pencil className="size-6" aria-hidden />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>,
    document.body,
  );
}
