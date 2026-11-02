// Composer: textarea (Enter sends, Shift+Enter newline), photo, location and mic (browser dictation) buttons.
// Full voice-to-voice mode with the Voice Orb arrives in P3.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, MicOff, SendHorizontal } from 'lucide-react';
import { Button } from '@/design/ui/button';
import { SPEECH_CODES } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult:
    ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
const RecognitionCtor: (new () => Recognition) | undefined =
  typeof window !== 'undefined'
    ? ((
        window as unknown as {
          SpeechRecognition?: new () => Recognition;
          webkitSpeechRecognition?: new () => Recognition;
        }
      ).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition)
    : undefined;

/** Simple dictation into the composer (Web Speech API). */
function useDictation(lang: string, onText: (text: string, final: boolean) => void) {
  const rec = useRef<Recognition | null>(null);
  const [listening, setListening] = useState(false);
  const start = () => {
    if (!RecognitionCtor) return;
    const r = new RecognitionCtor();
    r.lang = SPEECH_CODES[lang as keyof typeof SPEECH_CODES] ?? 'en-IN';
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => {
      const res = Array.from(e.results);
      onText(
        res.map((x) => x[0].transcript).join(' '),
        res.every((x) => x.isFinal),
      );
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    r.start();
    setListening(true);
  };
  const stop = () => rec.current?.stop();
  useEffect(() => () => rec.current?.stop(), []);
  return { supported: !!RecognitionCtor, listening, start, stop };
}

export interface ComposerProps {
  onSend: (text: string, mode: 'text' | 'voice') => void;
  disabled?: boolean;
  lang: string;
  /** Extra buttons (photo, location) rendered before the text box. */
  tools?: ReactNode;
  autoFocus?: boolean;
  placeholder?: string;
  /** Pending photos: allows sending with an empty text box. */
  hasAttachments?: boolean;
  /** When set, the mic opens full voice mode instead of simple dictation. */
  onVoice?: () => void;
  /** Text to start with (e.g. a department phrase from the guide's "Report this issue"). */
  initialText?: string;
}

export function Composer({
  onSend,
  disabled,
  lang,
  tools,
  autoFocus,
  placeholder,
  hasAttachments,
  onVoice,
  initialText,
}: ComposerProps) {
  const { t } = useTranslation('citizen');
  const [text, setText] = useState(initialText ?? '');
  const [viaVoice, setViaVoice] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const dictation = useDictation(lang, (s) => {
    setText(s);
    setViaVoice(true);
  });

  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(160, el.scrollHeight)}px`;
  }, [text]);

  const submit = () => {
    const v = text.trim();
    if ((!v && !hasAttachments) || disabled) return;
    onSend(v, viaVoice ? 'voice' : 'text');
    setText('');
    setViaVoice(false);
  };

  return (
    <form
      className="bg-surface flex items-end gap-1.5 rounded-[var(--radius-xl)] border p-1.5 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex items-center">{tools}</div>
      <label htmlFor="composer" className="sr-only">
        {t('report.placeholder')}
      </label>
      <textarea
        id="composer"
        ref={ta}
        rows={1}
        value={text}
        autoFocus={autoFocus}
        onChange={(e) => {
          setText(e.target.value);
          setViaVoice(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder ?? t('report.placeholder')}
        className="placeholder:text-muted-foreground max-h-40 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-base outline-none"
        data-testid="composer-input"
      />
      {onVoice ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="touch-target shrink-0 rounded-full"
          onClick={onVoice}
          aria-label={t('voice.open')}
          data-testid="voice-open"
        >
          <Mic className="size-5" aria-hidden />
        </Button>
      ) : (
        dictation.supported && (
          <Button
            type="button"
            variant={dictation.listening ? 'destructive' : 'ghost'}
            size="icon"
            className={cn('touch-target shrink-0 rounded-full', dictation.listening && 'animate-pulse')}
            onClick={() => (dictation.listening ? dictation.stop() : dictation.start())}
            aria-label={dictation.listening ? t('report.mic_stop') : t('report.mic_start')}
            aria-pressed={dictation.listening}
          >
            {dictation.listening ? (
              <MicOff className="size-5" aria-hidden />
            ) : (
              <Mic className="size-5" aria-hidden />
            )}
          </Button>
        )
      )}
      <Button
        type="submit"
        size="icon"
        className="touch-target shrink-0 rounded-full"
        disabled={disabled || (!text.trim() && !hasAttachments)}
        aria-label={t('report.send')}
        data-testid="composer-send"
      >
        <SendHorizontal className="rtl-flip size-5" aria-hidden />
      </Button>
    </form>
  );
}
