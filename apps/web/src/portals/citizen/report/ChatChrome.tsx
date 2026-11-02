// Small pieces of the report screen: language chip, progress dots, quick-reply chips.
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { Check, MapPin, X } from 'lucide-react';
import type { Lang } from '@contracts/types';
import { LANGUAGE_NAMES } from '@/lib/i18n';
import { usePrefs } from '@/lib/prefs/store';
import { cn } from '@/lib/utils';

/** "Telugu · detected", or "Tenglish" / "Hinglish" for code-mixed input. */
export function LanguageChip({ lang, mixed }: { lang: Lang; mixed: boolean }) {
  const { t } = useTranslation('citizen');
  const name = LANGUAGE_NAMES[lang] ?? LANGUAGE_NAMES.other;
  const label = mixed && lang === 'te' ? 'Tenglish' : mixed && lang === 'hi' ? 'Hinglish' : t('report.detected', { lang: name.native });
  return (
    <span className="bg-signal/12 text-signal border-signal/30 inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium" data-testid="lang-chip" aria-live="polite">
      <span className="bg-signal size-1.5 rounded-full" aria-hidden />
      {label}
    </span>
  );
}

/** Dots for details still needed (filled = answered). */
export function ProgressDots({ total, remaining }: { total: number; remaining: number }) {
  const { t } = useTranslation('citizen');
  if (total <= 0) return null;
  const done = Math.max(0, total - remaining);
  return (
    <span className="inline-flex items-center gap-1" role="img" aria-label={t('report.progress', { done, total })}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cn('size-2 rounded-full transition-colors', i < done ? 'bg-primary' : 'bg-surface-2 border')} />
      ))}
    </span>
  );
}

export interface QuickReply {
  label: string;
  value: string;
}

const YES = new Set(['yes', 'confirm']);
const NO = new Set(['no', 'cancel']);

/** Quick replies. In easy (low-literacy) mode they become big icon-first buttons. */
export function QuickReplies({ items, onPick, onLocation, disabled }: { items: QuickReply[]; onPick: (q: QuickReply) => void; onLocation?: () => void; disabled?: boolean }) {
  const { t } = useTranslation('citizen');
  const easy = usePrefs((s) => s.low_literacy);
  if (!items.length && !onLocation) return null;
  return (
    <motion.div
      className={cn('flex gap-2 overflow-x-auto pb-1', easy ? 'flex-wrap' : 'flex-nowrap')}
      initial="initial"
      animate="animate"
      variants={{ animate: { transition: { staggerChildren: 0.05 } } }}
      role="group"
      aria-label={t('report.quick_replies')}
      data-testid="quick-replies"
    >
      {onLocation && (
        <motion.button
          type="button"
          variants={{ initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 } }}
          onClick={onLocation}
          disabled={disabled}
          className="border-primary/40 text-primary bg-primary/8 inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium"
        >
          <MapPin className="size-4" aria-hidden />
          {t('report.share_location')}
        </motion.button>
      )}
      {items.map((q) => {
        const Icon = YES.has(q.value) ? Check : NO.has(q.value) ? X : null;
        return (
          <motion.button
            key={q.value}
            type="button"
            variants={{ initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 } }}
            onClick={() => onPick(q)}
            disabled={disabled}
            className={cn(
              'bg-surface hover:border-primary/50 inline-flex shrink-0 items-center gap-1.5 rounded-full border font-medium transition-colors disabled:opacity-50',
              easy ? 'min-h-14 px-5 text-base' : 'min-h-11 px-4 text-sm',
              easy && YES.has(q.value) && 'bg-success/15 border-success/40 text-success',
              easy && NO.has(q.value) && 'bg-danger/10 border-danger/30 text-danger',
            )}
            data-testid={`qr-${q.value}`}
          >
            {Icon && <Icon className={easy ? 'size-6' : 'size-4'} aria-hidden />}
            {q.label}
          </motion.button>
        );
      })}
    </motion.div>
  );
}
