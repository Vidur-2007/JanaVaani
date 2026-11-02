// Status and label chips: PriorityChip, StatusChip, DepartmentBadge, LangBadge, AIBadge.
import type { ComponentType, SVGProps } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Building2,
  CircleHelp,
  Construction,
  Droplets,
  HeartPulse,
  Lamp,
  School,
  Sparkles,
  TrafficCone,
  Trash2,
  Waves,
  Zap,
} from 'lucide-react';
import type { DepartmentId, Lang, Priority, Status } from '@contracts/types';
import { LANGUAGE_NAMES } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type Size = 'sm' | 'md';
const sizeCls: Record<Size, string> = {
  sm: 'h-6 px-2 text-[11px] gap-1',
  md: 'h-7 px-2.5 text-xs gap-1.5',
};
const base = 'inline-flex shrink-0 items-center rounded-full font-medium whitespace-nowrap border';

// ---------------------------------------------------------------- PriorityChip

const PRIO_CLS: Record<Priority, string> = {
  critical: 'bg-prio-critical/15 text-prio-critical-fg border-prio-critical/40',
  high: 'bg-prio-high/15 text-prio-high-fg border-prio-high/40',
  medium: 'bg-prio-medium/20 text-prio-medium-fg border-prio-medium/45',
  low: 'bg-prio-low/15 text-prio-low-fg border-prio-low/40',
};

const PRIO_DOT: Record<Priority, string> = {
  critical: 'bg-prio-critical',
  high: 'bg-prio-high',
  medium: 'bg-prio-medium',
  low: 'bg-prio-low',
};

export interface PriorityChipProps {
  priority: Priority;
  score?: number;
  size?: Size;
  className?: string;
}

export function PriorityChip({ priority, score, size = 'md', className }: PriorityChipProps) {
  const { t } = useTranslation('common');
  return (
    <span className={cn(base, sizeCls[size], PRIO_CLS[priority], className)} data-priority={priority}>
      <span className={cn('size-1.5 rounded-full', PRIO_DOT[priority], priority === 'critical' && 'animate-pulse')} aria-hidden />
      {t(`priority.${priority}`)}
      {score != null && <span className="tabular font-mono opacity-80">{score}</span>}
    </span>
  );
}

// ---------------------------------------------------------------- StatusChip

const STATUS_CLS: Record<Status, string> = {
  registered: 'bg-surface-2 text-text border-border',
  needs_review: 'bg-warning/15 text-warning border-warning/40',
  assigned: 'bg-signal/12 text-signal border-signal/40',
  in_progress: 'bg-primary/12 text-primary border-primary/40',
  resolved_pending_verification: 'bg-ai/12 text-ai border-ai/40',
  closed: 'bg-success/12 text-success border-success/40',
  reopened: 'bg-danger/12 text-danger border-danger/40',
  rejected: 'bg-surface-2 text-muted-foreground border-border',
  merged: 'bg-surface-2 text-muted-foreground border-border',
};

export function StatusChip({ status, size = 'md', className }: { status: Status; size?: Size; className?: string }) {
  const { t } = useTranslation('common');
  return (
    <span className={cn(base, sizeCls[size], STATUS_CLS[status], className)} data-status={status}>
      {t(`status.${status}`)}
    </span>
  );
}

// ---------------------------------------------------------------- DepartmentBadge

export const DEPARTMENT_ICONS: Record<DepartmentId, ComponentType<SVGProps<SVGSVGElement>>> = {
  roads: Construction,
  sanitation: Trash2,
  water: Droplets,
  streetlights: Lamp,
  power: Zap,
  drainage: Waves,
  traffic: TrafficCone,
  health: HeartPulse,
  education: School,
  town_planning: Building2,
  other: CircleHelp,
};

export interface DepartmentBadgeProps {
  department: DepartmentId;
  size?: Size;
  /** Icon only (name goes to aria-label/title). */
  iconOnly?: boolean;
  className?: string;
}

export function DepartmentBadge({ department, size = 'md', iconOnly, className }: DepartmentBadgeProps) {
  const { t } = useTranslation('common');
  const Icon = DEPARTMENT_ICONS[department] ?? CircleHelp;
  const name = t(`departments.${department}`);
  const color = `var(--dept-${department})`;
  return (
    <span
      className={cn(base, sizeCls[size], 'bg-surface text-text', iconOnly && 'aspect-square justify-center px-0', className)}
      style={{ borderColor: `color-mix(in oklab, ${color} 55%, transparent)` }}
      title={iconOnly ? name : undefined}
      aria-label={iconOnly ? name : undefined}
      data-department={department}
    >
      <Icon className="size-3.5 shrink-0" style={{ color }} aria-hidden />
      {!iconOnly && <span className="truncate">{name}</span>}
    </span>
  );
}

// ---------------------------------------------------------------- LangBadge

export function LangBadge({ lang, codeMixed, size = 'sm', className }: { lang: Lang; codeMixed?: boolean; size?: Size; className?: string }) {
  const { t } = useTranslation('common');
  const name = LANGUAGE_NAMES[lang] ?? LANGUAGE_NAMES.other;
  return (
    <span className={cn(base, sizeCls[size], 'bg-surface-2 text-text border-border', className)} title={name.en} data-lang={lang}>
      <span lang={lang}>{name.native}</span>
      {codeMixed && <span className="text-muted-foreground">· {t('lang.code_mixed')}</span>}
    </span>
  );
}

// ---------------------------------------------------------------- AIBadge

export interface AIBadgeProps {
  /** 'suggested' = AI output awaiting a human; 'approved' = "AI-suggested · human-approved". */
  variant?: 'suggested' | 'approved' | 'generated';
  label?: string;
  size?: Size;
  className?: string;
}

/** Transparency marker. Indigo is reserved for AI-generated content. */
export function AIBadge({ variant = 'approved', label, size = 'sm', className }: AIBadgeProps) {
  const { t } = useTranslation('common');
  return (
    <span className={cn(base, sizeCls[size], 'bg-ai/12 text-ai border-ai/40', className)} data-ai={variant}>
      <Sparkles className="size-3" aria-hidden />
      {label ?? t(`ai.${variant}`)}
    </span>
  );
}
