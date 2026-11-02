// Data display: KPIStat (count-up), Timeline (basic), SLACountdown (basic), BeforeAfterSlider (basic).
import { useEffect, useRef, useState, type ComponentType, type ReactNode, type SVGProps } from 'react';
import { useTranslation } from 'react-i18next';
import { animate, motion, useInView } from 'motion/react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  CircleDot,
  Clock,
  FileText,
  GitMerge,
  Link2,
  MessageSquare,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import type { SLA, TimelineEvent, TimelineEventType } from '@contracts/types';
import { useLangFormat } from '@/lib/i18n/useLangFormat';
import { pickLocalized } from '@/lib/localized';
import { useReducedMotion } from '@/lib/prefs/store';
import { cn } from '@/lib/utils';
import { countUpMs, easeOutExpo, listItem, stagger } from '@/design/motion';

// ---------------------------------------------------------------- KPIStat

export interface KPIStatProps {
  label: string;
  value: number;
  /** Custom formatter; defaults to locale number. */
  format?: (n: number) => string;
  decimals?: number;
  suffix?: string;
  /** Change vs previous period. Positive = up. */
  delta?: number;
  /** Whether "up" is good (green) — e.g. false for overdue counts. */
  upIsGood?: boolean;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  hint?: ReactNode;
  className?: string;
}

export function KPIStat({ label, value, format, decimals = 0, suffix, delta, upIsGood = true, icon: Icon, hint, className }: KPIStatProps) {
  const fmt = useLangFormat();
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });
  const [shown, setShown] = useState(reduced ? value : 0);

  useEffect(() => {
    if (reduced) {
      setShown(value);
      return;
    }
    if (!inView) return;
    const controls = animate(0, value, { duration: countUpMs / 1000, ease: easeOutExpo, onUpdate: setShown });
    return () => controls.stop();
  }, [value, inView, reduced]);

  const text = format ? format(shown) : fmt.number(+shown.toFixed(decimals));
  const good = delta == null ? null : delta === 0 ? null : delta > 0 === upIsGood;
  return (
    <div ref={ref} className={cn('bg-surface rounded-[var(--radius-lg)] border p-4', className)}>
      <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs font-medium">
        <span>{label}</span>
        {Icon && <Icon className="size-4" aria-hidden />}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-display tabular text-3xl font-semibold tracking-tight" aria-label={`${format ? format(value) : fmt.number(value)}${suffix ?? ''}`}>
          {text}
          {suffix}
        </span>
        {delta != null && delta !== 0 && (
          <span className={cn('tabular inline-flex items-center text-xs font-medium', good ? 'text-success' : 'text-danger')}>
            {delta > 0 ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
            {fmt.number(Math.abs(delta))}
          </span>
        )}
      </div>
      {hint && <div className="text-muted-foreground mt-1 text-xs">{hint}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Timeline

const EVENT_ICON: Partial<Record<TimelineEventType, ComponentType<SVGProps<SVGSVGElement>>>> = {
  registered: FileText,
  classified: Sparkles,
  routing_review: AlertTriangle,
  assigned: UserCheck,
  reassigned: UserCheck,
  message: MessageSquare,
  note: MessageSquare,
  escalated: ShieldAlert,
  emergency_flagged: ShieldAlert,
  emergency_confirmed: ShieldAlert,
  resolution_submitted: BadgeCheck,
  ai_verification: Sparkles,
  citizen_verified: BadgeCheck,
  citizen_rejected: RotateCcw,
  reopened: RotateCcw,
  merged: GitMerge,
  closed: BadgeCheck,
};

const EVENT_TONE: Partial<Record<TimelineEventType, string>> = {
  classified: 'text-ai bg-ai/12',
  ai_verification: 'text-ai bg-ai/12',
  escalated: 'text-danger bg-danger/12',
  emergency_flagged: 'text-danger bg-danger/12',
  emergency_confirmed: 'text-danger bg-danger/12',
  citizen_verified: 'text-success bg-success/12',
  closed: 'text-success bg-success/12',
  reopened: 'text-warning bg-warning/15',
  citizen_rejected: 'text-warning bg-warning/15',
};

export interface TimelineProps {
  events: TimelineEvent[];
  /** Hide officer-only notes (default true for citizen views; the API already filters them). */
  hideInternal?: boolean;
  /** Show the hash-chain link icon per event. */
  showChain?: boolean;
  /** Newest first (default false = oldest first). */
  reverse?: boolean;
  className?: string;
}

export function Timeline({ events, hideInternal = true, showChain, reverse, className }: TimelineProps) {
  const { t, i18n } = useTranslation('common');
  const fmt = useLangFormat();
  const list = (hideInternal ? events.filter((e) => !e.internal) : events).slice();
  if (reverse) list.reverse();
  return (
    <motion.ol variants={stagger()} initial="initial" animate="animate" className={cn('relative space-y-4', className)} aria-label={t('timeline.label')}>
      {list.map((e, i) => {
        const Icon = EVENT_ICON[e.type] ?? CircleDot;
        const msg = e.message ? pickLocalized(e.message, i18n.language) : null;
        return (
          <motion.li key={e.id} custom={i} variants={listItem} className="relative flex gap-3">
            {i < list.length - 1 && <span className="bg-border absolute start-4 top-9 -bottom-4 w-px" aria-hidden />}
            <span className={cn('grid size-8 shrink-0 place-items-center rounded-full', EVENT_TONE[e.type] ?? 'bg-surface-2 text-muted-foreground')}>
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <p className="text-sm font-medium">
                {t(`timeline.types.${e.type}`, { defaultValue: e.message_en })}
                {e.internal && <span className="text-warning ms-2 text-xs">{t('timeline.internal')}</span>}
              </p>
              <p className="text-muted-foreground text-sm break-words" lang={msg?.lang} dir={msg?.dir}>
                {msg && msg.text !== e.message_en ? msg.text : e.message_en}
              </p>
              <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
                <time dateTime={e.created_at}>{fmt.dateTime(e.created_at)}</time>
                {e.actor_name && <span>· {e.actor_name}</span>}
                {showChain && (
                  <span className="inline-flex items-center gap-1 font-mono" title={e.hash}>
                    <Link2 className="size-3" aria-hidden />
                    {e.hash.slice(0, 8)}
                  </span>
                )}
              </p>
            </div>
          </motion.li>
        );
      })}
    </motion.ol>
  );
}

// ---------------------------------------------------------------- SLACountdown

export interface SLACountdownProps {
  sla: SLA;
  /** Stop counting (closed / resolved). */
  stopped?: boolean;
  compact?: boolean;
  className?: string;
}

/** Ticks every 30 s from `due_at`. Amber under 25% remaining, red when breached. */
export function SLACountdown({ sla, stopped, compact, className }: SLACountdownProps) {
  const { t } = useTranslation('common');
  const fmt = useLangFormat();
  const [now, setNow] = useState(() => Date.now());
  // The API's remaining_minutes reflects the server (or demo) clock; keep that offset while ticking locally.
  const [offset] = useState(() => Date.parse(sla.due_at) - Date.now() - sla.remaining_minutes * 60_000);
  useEffect(() => {
    if (stopped) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [stopped]);
  const remaining = stopped ? sla.remaining_minutes : Math.round((Date.parse(sla.due_at) - now - offset) / 60_000);
  const breached = !stopped && (sla.breached || remaining < 0);
  const low = !breached && remaining < sla.hours * 60 * 0.25;
  const tone = stopped ? 'text-muted-foreground' : breached ? 'text-danger' : low ? 'text-warning' : 'text-text';
  const label = stopped ? t('sla.stopped') : breached ? t('sla.overdue_by', { time: fmt.duration(-remaining) }) : t('sla.due_in', { time: fmt.duration(remaining) });
  return (
    <span className={cn('tabular inline-flex items-center gap-1.5 font-mono text-xs font-medium', tone, className)} data-breached={breached || undefined} title={fmt.dateTime(sla.due_at)}>
      <Clock className="size-3.5" aria-hidden />
      {compact && !stopped ? (breached ? `-${fmt.duration(-remaining)}` : fmt.duration(remaining)) : label}
    </span>
  );
}

// ---------------------------------------------------------------- BeforeAfterSlider

export interface BeforeAfterSliderProps {
  before: string;
  after: string;
  beforeAlt?: string;
  afterAlt?: string;
  className?: string;
}

export function BeforeAfterSlider({ before, after, beforeAlt, afterAlt, className }: BeforeAfterSliderProps) {
  const { t } = useTranslation('common');
  const [pos, setPos] = useState(50);
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const setFromX = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    let p = ((clientX - r.left) / r.width) * 100;
    if (document.documentElement.dir === 'rtl') p = 100 - p;
    setPos(Math.max(0, Math.min(100, p)));
  };
  return (
    <div
      ref={ref}
      className={cn('relative aspect-[4/3] w-full touch-none overflow-hidden rounded-[var(--radius-lg)] border select-none', className)}
      onPointerDown={(e) => {
        dragging.current = true;
        (e.target as Element).setPointerCapture?.(e.pointerId);
        setFromX(e.clientX);
      }}
      onPointerMove={(e) => dragging.current && setFromX(e.clientX)}
      onPointerUp={() => (dragging.current = false)}
      dir="ltr"
    >
      <img src={after} alt={afterAlt ?? t('before_after.after')} className="absolute inset-0 size-full object-cover" draggable={false} />
      <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <img src={before} alt={beforeAlt ?? t('before_after.before')} className="absolute inset-0 size-full object-cover" draggable={false} />
      </div>
      <div className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.3)]" style={{ left: `${pos}%` }} aria-hidden>
        <span className="absolute top-1/2 left-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-xs font-bold text-black shadow-lg">
          ⇆
        </span>
      </div>
      <span className="absolute start-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">{t('before_after.before')}</span>
      <span className="absolute end-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">{t('before_after.after')}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(pos)}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label={t('before_after.label')}
        className="absolute inset-x-0 bottom-0 h-11 w-full cursor-ew-resize opacity-0"
      />
    </div>
  );
}
