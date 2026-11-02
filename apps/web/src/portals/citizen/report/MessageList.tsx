// Chat message list: aria-live, typing indicator, word-by-word reveal for fresh bot replies,
// AI badge + Listen on every bot message (auto-plays in voice/low-literacy mode).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import type { Lang } from '@contracts/types';
import { Button } from '@/design/ui/button';
import { AIBadge, ListenButton, SLACountdown, StatusChip } from '@/design/components';
import { easeOutExpo } from '@/design/motion';
import { pickLocalized } from '@/lib/localized';
import { usePrefs, useReducedMotion } from '@/lib/prefs/store';
import { useSpeak } from '@/lib/tts/useSpeak';
import { cn } from '@/lib/utils';
import type { ChatMessage } from './useChatSession';

/** Reveals words over 400–900 ms. The full text is always available to screen readers. */
function WordReveal({ text, animate, onDone }: { text: string; animate: boolean; onDone: () => void }) {
  const words = text.split(/(\s+)/);
  const [n, setN] = useState(animate ? 0 : words.length);
  useEffect(() => {
    if (!animate) return;
    const total = Math.min(900, Math.max(400, words.length * 45));
    const step = total / Math.max(1, words.length);
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setN(i);
      if (i >= words.length) {
        window.clearInterval(id);
        onDone();
      }
    }, step);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, text]);
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {words.slice(0, n).join('')}
        {n < words.length && <span className="opacity-0">{words.slice(n).join('')}</span>}
      </span>
    </>
  );
}

export function TypingIndicator() {
  const { t } = useTranslation('citizen');
  return (
    <div className="flex items-end gap-2" role="status" aria-label={t('report.typing')}>
      <div className="bg-surface flex h-10 items-center gap-1 rounded-2xl rounded-es-sm border px-4">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="bg-muted-foreground size-1.5 rounded-full"
            animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </div>
    </div>
  );
}

function TrackedCards({ items }: { items: NonNullable<ChatMessage['tracked']> }) {
  const { i18n } = useTranslation();
  return (
    <ul className="mt-2 space-y-2">
      {items.map((g) => {
        const title = pickLocalized(g.title, i18n.language);
        return (
          <li key={g.id}>
            <Link to={`/app/complaints/${g.id}`} className="bg-surface-2 block rounded-xl p-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip status={g.status} size="sm" />
                <SLACountdown sla={g.sla} compact stopped={['closed', 'rejected', 'merged', 'resolved_pending_verification'].includes(g.status)} />
              </div>
              <p className="mt-1 text-sm font-medium" lang={title.lang} dir={title.dir}>
                {title.text}
              </p>
              <p className="text-muted-foreground font-mono text-xs">{g.id}</p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function BotBubble({ m, onSettled, onRetry }: { m: ChatMessage; onSettled: (id: string) => void; onRetry: () => void }) {
  const { t } = useTranslation('citizen');
  const reduced = useReducedMotion();
  const [showEn, setShowEn] = useState(false);
  const text = showEn && m.en ? m.en : m.text;
  if (m.error)
    return (
      <div className="bg-danger/10 border-danger/30 flex max-w-[85%] items-start gap-2 rounded-2xl border p-3 text-sm" role="alert">
        <AlertTriangle className="text-danger mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="space-y-2">
          <p>{t('report.error_send')}</p>
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RotateCw className="size-4" aria-hidden />
            {t('report.retry')}
          </Button>
        </div>
      </div>
    );
  return (
    <div className="max-w-[85%] space-y-1.5">
      <div className="bg-surface rounded-2xl rounded-es-sm border px-4 py-3 leading-relaxed" lang={showEn ? 'en' : m.lang} dir={showEn ? 'ltr' : m.dir}>
        <WordReveal text={text} animate={!!m.fresh && !reduced && !showEn} onDone={() => onSettled(m.id)} />
        {m.tracked && <TrackedCards items={m.tracked} />}
      </div>
      <div className="flex flex-wrap items-center gap-1 ps-1">
        <AIBadge variant="generated" />
        <ListenButton text={text} lang={(showEn ? 'en' : m.lang) as Lang} size="sm" className="h-8 min-h-8 px-2 text-xs" />
        {m.en && m.en !== m.text && (
          <button type="button" className="text-muted-foreground hover:text-text px-2 text-xs underline-offset-2 hover:underline" onClick={() => setShowEn((v) => !v)}>
            {showEn ? t('report.show_original') : t('report.show_english')}
          </button>
        )}
      </div>
    </div>
  );
}

function UserBubble({ m }: { m: ChatMessage }) {
  return (
    <div className="flex max-w-[85%] flex-col items-end gap-1.5">
      {m.media && (
        <div className="flex flex-wrap justify-end gap-1.5">
          {m.media.map((x) => (
            <img key={x.id} src={x.url} alt={x.ai?.description_en ?? ''} className="size-20 rounded-xl border object-cover" />
          ))}
        </div>
      )}
      {m.text && (
        <div className="bg-primary text-primary-foreground rounded-2xl rounded-ee-sm px-4 py-3 leading-relaxed whitespace-pre-wrap" lang={m.lang} dir={m.dir}>
          {m.text}
        </div>
      )}
    </div>
  );
}

export function MessageList({
  messages,
  pending,
  onSettled,
  onRetry,
  footer,
}: {
  messages: ChatMessage[];
  pending: boolean;
  onSettled: (id: string) => void;
  onRetry: () => void;
  footer?: ReactNode;
}) {
  const { t } = useTranslation('citizen');
  const end = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const autoplay = usePrefs((s) => s.voice_autoplay || s.low_literacy);
  const { speak } = useSpeak();
  const spoken = useRef(new Set<string>());

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'end' });
  }, [messages.length, pending, footer, reduced]);

  // Auto-play fresh bot replies in voice-first / low-literacy mode.
  useEffect(() => {
    if (!autoplay) return;
    const last = [...messages].reverse().find((m) => m.role === 'bot' && m.fresh && !m.error);
    if (last && !spoken.current.has(last.id)) {
      spoken.current.add(last.id);
      speak(last.text, last.lang as Lang);
    }
  }, [messages, autoplay, speak]);

  return (
    <div className="space-y-4" role="log" aria-live="polite" aria-label={t('report.conversation')} data-testid="chat-log">
      {messages.map((m) => (
        <motion.div
          key={m.id}
          className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
          initial={m.fresh || m.role === 'user' ? { opacity: 0, y: 10 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: easeOutExpo }}
          data-role={m.role}
        >
          {m.role === 'bot' ? <BotBubble m={m} onSettled={onSettled} onRetry={onRetry} /> : <UserBubble m={m} />}
        </motion.div>
      ))}
      {pending && <TypingIndicator />}
      {footer}
      <div ref={end} />
    </div>
  );
}
