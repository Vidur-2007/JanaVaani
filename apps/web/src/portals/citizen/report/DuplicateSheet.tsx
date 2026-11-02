// DuplicateSheet (features 89–96, 255): similar reports nearby → "Add my support" or "Mine is different".
// After supporting: a celebratory micro-animation and "You'll be notified when it's fixed" (feature 105).
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { BellRing, HandHeart, Loader2, MapPin, Users } from 'lucide-react';
import type { DuplicateMatch } from '@contracts/types';
import { Button } from '@/design/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/design/ui/sheet';
import { LangBadge, StatusChip, useCountUp } from '@/design/components';
import { pickLocalized } from '@/lib/localized';
import { usePrefs, useReducedMotion } from '@/lib/prefs/store';
import { cn } from '@/lib/utils';

const distance = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

export function DuplicateSheet({
  open,
  onOpenChange,
  matches,
  busy,
  onSupport,
  onFileNew,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  matches: DuplicateMatch[];
  busy?: boolean;
  onSupport: (m: DuplicateMatch) => void;
  onFileNew: () => void;
}) {
  const { t, i18n } = useTranslation('citizen');
  const easy = usePrefs((s) => s.low_literacy);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-h-[90dvh] max-w-2xl overflow-y-auto rounded-t-[var(--radius-xl)]" data-testid="duplicate-sheet">
        <SheetHeader>
          <SheetTitle>{t('dup.title')}</SheetTitle>
          <SheetDescription>{t('dup.subtitle')}</SheetDescription>
        </SheetHeader>
        <div className="space-y-3 px-4 pb-6">
          <ul className="space-y-2">
            {matches.map((m, i) => {
              const title = pickLocalized(m.title, i18n.language);
              const affected = m.support_count + 1;
              return (
                <li key={m.incident_id ?? m.grievance_id ?? i} className="bg-surface space-y-3 rounded-[var(--radius-lg)] border p-4">
                  <p className="font-medium" lang={title.lang} dir={title.dir}>
                    {title.text}
                  </p>
                  <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-4" aria-hidden />
                      {t('dup.away', { distance: distance(m.distance_m) })}
                    </span>
                    <span className="text-text inline-flex items-center gap-1 font-medium">
                      <Users className="size-4" aria-hidden />
                      {t('dup.affected', { count: affected })}
                    </span>
                    <StatusChip status={m.status} size="sm" />
                    <LangBadge lang={m.language} />
                    <span className="tabular font-mono text-xs">{t('dup.similar', { pct: Math.round(m.similarity * 100) })}</span>
                  </div>
                  <Button className={cn('touch-target w-full text-base', easy ? 'h-16 rounded-2xl text-lg' : 'h-12')} disabled={busy} onClick={() => onSupport(m)} data-testid={`dup-support-${i}`}>
                    {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <HandHeart className="size-5" aria-hidden />}
                    {t('dup.support')}
                  </Button>
                </li>
              );
            })}
          </ul>
          <Button variant="outline" className={cn('touch-target w-full', easy ? 'h-16 rounded-2xl text-lg' : 'h-12')} disabled={busy} onClick={onFileNew} data-testid="dup-file-new">
            {t('dup.file_new')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Celebration after adding support to an existing report. */
/** "N people affected", counting up from the old total to include the citizen who just added support. */
function AffectedCount({ count }: { count: number }) {
  const { t } = useTranslation('citizen');
  const shown = useCountUp(count, Math.max(0, count - 1));
  return (
    <p className="text-muted-foreground tabular text-sm">
      {/* Screen readers get the final number once; the animated one is visual only. */}
      <span className="sr-only">{t('dup.now_affected', { count })}</span>
      <span aria-hidden>{t('dup.now_affected', { count: shown })}</span>
    </p>
  );
}

export function SupportCelebration({ count }: { count?: number }) {
  const { t } = useTranslation('citizen');
  const reduced = useReducedMotion();
  const colors = ['var(--primary)', 'var(--accent)', 'var(--success)', 'var(--warning)', 'var(--ai)'];
  return (
    <div className="bg-surface relative mx-auto w-full max-w-md overflow-hidden rounded-[var(--radius-xl)] border p-6 text-center" role="status" data-testid="support-celebration">
      {!reduced &&
        Array.from({ length: 18 }, (_, i) => {
          const angle = (i / 18) * Math.PI * 2;
          return (
            <motion.span
              key={i}
              className="absolute top-14 left-1/2 size-2 rounded-full"
              style={{ background: colors[i % colors.length] }}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{ x: Math.cos(angle) * 120, y: Math.sin(angle) * 80, opacity: 0, scale: 0.4 }}
              transition={{ duration: 1.1, ease: 'easeOut', delay: 0.15 }}
              aria-hidden
            />
          );
        })}
      <motion.div
        className="bg-success/15 text-success mx-auto grid size-16 place-items-center rounded-full"
        initial={reduced ? false : { scale: 0.4, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 14 }}
      >
        <HandHeart className="size-8" aria-hidden />
      </motion.div>
      <p className="font-display mt-4 text-xl font-semibold">{t('dup.thanks')}</p>
      {count != null && <AffectedCount count={count} />}
      <p className="mt-3 inline-flex items-center gap-2 text-sm">
        <BellRing className="text-primary size-4" aria-hidden />
        {t('dup.notified')}
      </p>
    </div>
  );
}
