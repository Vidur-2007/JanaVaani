// "How it works" scroll story: 4 pinned steps (Speak → AI understands → Officer acts → You verify),
// each with a live-looking UI vignette. Pinned on desktop; stacked on mobile and under reduced motion.
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'motion/react';
import { BadgeCheck, Brain, Check, Landmark, Mic, X } from 'lucide-react';
import {
  AIBadge,
  DepartmentBadge,
  LangBadge,
  PriorityChip,
  SLACountdown,
  StatusChip,
} from '@/design/components';
import { easeOutExpo } from '@/design/motion';
import { useReducedMotion } from '@/lib/prefs/store';
import { cn } from '@/lib/utils';

// Synthetic demo content (the master §16 live-wire story), shown as the citizen typed it.
const SAMPLE_TE = 'మా స్కూల్ దగ్గర కరెంటు తీగ తెగి రోడ్డుపై పడింది. పిల్లలు అటు నుంచే వెళ్తారు.';
const SAMPLE_EN = 'A power line has snapped and fallen on the road near our school. Children walk that way.';
const DEMO_SLA = {
  hours: 4,
  due_at: '2099-01-01T00:00:00Z',
  breached: false,
  remaining_minutes: 222,
  delay_risk: 'low' as const,
};

const STEPS = [
  { key: 'speak', icon: Mic },
  { key: 'understand', icon: Brain },
  { key: 'act', icon: Landmark },
  { key: 'verify', icon: BadgeCheck },
] as const;

function Bars() {
  const reduced = useReducedMotion();
  return (
    <div className="flex h-12 items-center gap-1" aria-hidden>
      {Array.from({ length: 28 }, (_, i) => (
        <motion.span
          key={i}
          className="bg-primary w-1 rounded-full"
          initial={{ height: 6 }}
          animate={reduced ? { height: 10 + ((i * 7) % 26) } : { height: [8, 14 + ((i * 13) % 30), 8] }}
          transition={
            reduced ? undefined : { duration: 0.9 + (i % 5) * 0.12, repeat: Infinity, ease: 'easeInOut' }
          }
        />
      ))}
    </div>
  );
}

function Vignette({ step }: { step: number }) {
  const { t } = useTranslation('landing');
  const card = 'bg-surface w-full rounded-[var(--radius-xl)] border p-5 shadow-2xl';
  switch (step) {
    case 0:
      return (
        <div className={card}>
          <p className="text-muted-foreground mb-3 text-xs font-medium">{t('how.v.listening')}</p>
          <Bars />
          <p className="mt-4 text-lg leading-relaxed" lang="te">
            {SAMPLE_TE}
          </p>
        </div>
      );
    case 1:
      return (
        <div className={cn(card, 'space-y-3')}>
          <div className="flex flex-wrap items-center gap-2">
            <LangBadge lang="te" />
            <AIBadge variant="suggested" />
          </div>
          <p className="text-muted-foreground text-sm">{t('how.v.translation')}</p>
          <p>{SAMPLE_EN}</p>
          <motion.div
            className="flex flex-wrap gap-2 pt-1"
            initial="initial"
            animate="animate"
            variants={{ animate: { transition: { staggerChildren: 0.15 } } }}
          >
            {[
              <DepartmentBadge key="d" department="power" />,
              <PriorityChip key="p" priority="critical" score={92} />,
              <SLACountdown key="s" sla={DEMO_SLA} />,
            ].map((el, i) => (
              <motion.span
                key={i}
                variants={{ initial: { opacity: 0, scale: 0.8 }, animate: { opacity: 1, scale: 1 } }}
              >
                {el}
              </motion.span>
            ))}
          </motion.div>
        </div>
      );
    case 2:
      return (
        <div className={cn(card, 'space-y-3')}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs">GRV-2026-000101</span>
            <StatusChip status="in_progress" />
          </div>
          <div className="bg-surface-2 rounded-xl p-3">
            <p className="text-muted-foreground text-xs">{t('how.v.officer')}</p>
            <p className="mt-1" lang="te">
              మా బృందం స్థలాన్ని పరిశీలించింది, పని ప్రారంభమైంది.
            </p>
          </div>
          <p className="text-muted-foreground text-xs">{t('how.v.officer_note')}</p>
        </div>
      );
    default:
      return (
        <div className={cn(card, 'space-y-4 text-center')}>
          <p className="font-display text-lg font-semibold">{t('how.v.verify_q')}</p>
          <div className="grid grid-cols-2 gap-3">
            <span className="bg-success/15 text-success grid h-16 place-items-center rounded-2xl">
              <Check className="size-8" aria-hidden />
            </span>
            <span className="bg-danger/12 text-danger grid h-16 place-items-center rounded-2xl">
              <X className="size-8" aria-hidden />
            </span>
          </div>
          <p className="text-muted-foreground text-xs">{t('how.v.verify_note')}</p>
        </div>
      );
  }
}

function StepText({ i, active }: { i: number; active: boolean }) {
  const { t } = useTranslation('landing');
  const { key, icon: Icon } = STEPS[i];
  return (
    // The current step is marked by colour + a start-side bar; the others keep full text contrast (WCAG 1.4.3).
    <div
      className={cn(
        'flex gap-4 border-s-2 ps-4 transition-colors duration-300',
        active ? 'border-primary' : 'border-transparent',
      )}
      aria-current={active ? 'step' : undefined}
    >
      <span
        className={cn(
          'grid size-11 shrink-0 place-items-center rounded-2xl border',
          active && 'border-primary bg-primary/15 text-primary',
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <div>
        <p className="text-muted-foreground font-mono text-xs">0{i + 1}</p>
        <h3 className={cn('font-display text-xl font-semibold transition-colors', active && 'text-primary')}>
          {t(`how.steps.${key}.title`)}
        </h3>
        <p className="text-muted-foreground mt-1 max-w-sm">{t(`how.steps.${key}.body`)}</p>
      </div>
    </div>
  );
}

export function HowItWorks({ pinned }: { pinned: boolean }) {
  const { t } = useTranslation('landing');
  const ref = useRef<HTMLElement>(null);
  const [step, setStep] = useState(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  useMotionValueEvent(scrollYProgress, 'change', (v) => setStep(Math.min(3, Math.max(0, Math.floor(v * 4)))));

  const header = (
    <header className="mb-10 max-w-2xl">
      <h2 className="font-display text-3xl font-semibold md:text-4xl">{t('how.title')}</h2>
      <p className="text-muted-foreground mt-2 text-lg">{t('how.subtitle')}</p>
    </header>
  );

  if (!pinned) {
    return (
      <section id="how" className="mx-auto max-w-6xl px-4 py-20">
        {header}
        <ol className="space-y-12">
          {STEPS.map((s, i) => (
            <li key={s.key} className="grid gap-6 md:grid-cols-2 md:items-center">
              <StepText i={i} active />
              <Vignette step={i} />
            </li>
          ))}
        </ol>
      </section>
    );
  }

  return (
    <section id="how" ref={ref} className="relative h-[400vh]" data-testid="how-pinned">
      <div className="sticky top-0 flex h-dvh items-center">
        <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 md:grid-cols-2 md:items-center">
          <div>
            {header}
            <ol className="space-y-6" aria-live="polite">
              {STEPS.map((s, i) => (
                <li key={s.key}>
                  <StepText i={i} active={i === step} />
                </li>
              ))}
            </ol>
          </div>
          <div className="relative grid min-h-80 place-items-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                className="w-full max-w-md"
                initial={{ opacity: 0, y: 30, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -30, scale: 0.97 }}
                transition={{ duration: 0.45, ease: easeOutExpo }}
              >
                <Vignette step={step} />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
