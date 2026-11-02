// The 7 citizen-facing steps (master §7): Registered → Classified → Assigned → In progress → Resolution submitted →
// Citizen verification → Closed. Completed steps draw a check; the current step glows.
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import type { GrievanceDetail, Status } from '@contracts/types';
import { useReducedMotion } from '@/lib/prefs/store';
import { cn } from '@/lib/utils';

export const STEP_KEYS = [
  'registered',
  'classified',
  'assigned',
  'in_progress',
  'resolution',
  'verification',
  'closed',
] as const;
export type StepKey = (typeof STEP_KEYS)[number];

/** Number of completed steps (0–7). The current step is at index `done` (unless all are done). */
export function completedSteps(g: GrievanceDetail): number {
  const has = (t: string) => g.timeline.some((e) => e.type === t);
  const s = g.status;
  const assigned =
    has('assigned') ||
    has('reassigned') ||
    ['assigned', 'in_progress', 'resolved_pending_verification', 'closed', 'reopened'].includes(s);
  const resolution = ['resolved_pending_verification', 'closed'].includes(s) && has('resolution_submitted');
  // 'In progress' is the current step while work is on (and again after a reopen); it is done once a resolution is submitted.
  const flags = [
    true,
    has('classified') || assigned,
    assigned,
    resolution,
    resolution,
    s === 'closed',
    s === 'closed',
  ];
  let n = 0;
  while (n < flags.length && flags[n]) n++;
  return n;
}

function Check({ animate }: { animate: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <motion.path
        d="M5 12.5l4.5 4.5L19 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={animate ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
      />
    </svg>
  );
}

export function StepProgress({ g }: { g: GrievanceDetail }) {
  const { t } = useTranslation('citizen');
  const reduced = useReducedMotion();
  const done = completedSteps(g);
  const halted = g.status === 'rejected' || g.status === 'merged';
  return (
    <ol
      className="relative grid gap-0 md:grid-cols-7"
      aria-label={t('tracker.progress_label', { done, total: STEP_KEYS.length })}
      data-testid="step-progress"
      data-done={done}
    >
      {STEP_KEYS.map((k, i) => {
        const isDone = i < done;
        const isCurrent = i === done && !halted;
        return (
          <li
            key={k}
            className="relative flex items-center gap-3 pb-4 md:flex-col md:gap-2 md:pb-0 md:text-center"
            aria-current={isCurrent ? 'step' : undefined}
          >
            {/* connector */}
            {i < STEP_KEYS.length - 1 && (
              <span
                className={cn(
                  'absolute start-4 top-8 h-[calc(100%-1rem)] w-0.5 md:start-[calc(50%+1rem)] md:top-4 md:h-0.5 md:w-[calc(100%-2rem)]',
                  i + 1 < done ? 'bg-success' : 'bg-border',
                )}
                aria-hidden
              />
            )}
            <span
              className={cn(
                'relative z-10 grid size-8 shrink-0 place-items-center rounded-full border-2 text-xs font-semibold',
                isDone && 'border-success bg-success text-white',
                isCurrent && 'border-primary bg-primary/12 text-primary',
                !isDone && !isCurrent && 'bg-surface text-muted-foreground',
              )}
            >
              {isCurrent && !reduced && (
                <span className="bg-primary/30 absolute inset-0 animate-ping rounded-full" aria-hidden />
              )}
              {isDone ? <Check animate={!reduced} /> : i + 1}
            </span>
            <span
              className={cn(
                'text-sm md:text-xs',
                isCurrent ? 'text-primary font-semibold' : isDone ? 'text-text' : 'text-muted-foreground',
              )}
            >
              {t(`tracker.steps.${k}`)}
              <span className="sr-only">
                {' '}
                —{' '}
                {isDone
                  ? t('tracker.step_done')
                  : isCurrent
                    ? t('tracker.step_current')
                    : t('tracker.step_todo')}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Completed steps from status alone, for list items without a timeline (chat tracking cards). */
export function stepsFromStatus(s: Status): number {
  if (s === 'closed') return 7;
  if (s === 'resolved_pending_verification') return 5;
  if (s === 'assigned' || s === 'in_progress' || s === 'reopened') return 3;
  return 1;
}

/** Compact 7-segment progress bar with the current step's name. */
export function MiniSteps({ status }: { status: Status }) {
  const { t } = useTranslation('citizen');
  const done = stepsFromStatus(status);
  const halted = status === 'rejected' || status === 'merged';
  const current = STEP_KEYS[Math.min(done, STEP_KEYS.length - 1)];
  return (
    <div className="space-y-1" data-testid="mini-steps" data-done={done}>
      <div
        className="flex gap-1"
        role="img"
        aria-label={t('tracker.progress_label', { done, total: STEP_KEYS.length })}
      >
        {STEP_KEYS.map((k, i) => (
          <span
            key={k}
            className={cn(
              'h-1.5 flex-1 rounded-full',
              i < done
                ? 'bg-success'
                : i === done && !halted
                  ? 'bg-primary animate-pulse motion-reduce:animate-none'
                  : 'bg-border',
            )}
          />
        ))}
      </div>
      {!halted && (
        <p className="text-muted-foreground text-xs">
          {done >= STEP_KEYS.length ? t('tracker.steps.closed') : t(`tracker.steps.${current}`)}
        </p>
      )}
    </div>
  );
}
