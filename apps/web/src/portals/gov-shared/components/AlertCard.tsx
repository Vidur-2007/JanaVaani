// AlertCard (Spec C §4): severity, what happened, where, and a link to the affected cases.
import type { ComponentType, SVGProps } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import {
  AlarmClock,
  Check,
  ChevronRight,
  ListChecks,
  Repeat,
  ShieldAlert,
  Siren,
  TrendingUp,
} from 'lucide-react';
import type { Alert } from '@contracts/types';
import { Button } from '@/design/ui/button';
import { DepartmentBadge, LangBadge } from '@/design/components';
import { fadeUp } from '@/design/motion';
import { useLangFormat } from '@/lib/i18n/useLangFormat';
import { useReducedMotion } from '@/lib/prefs/store';
import { cn } from '@/lib/utils';

const KIND_ICON: Record<Alert['kind'], ComponentType<SVGProps<SVGSVGElement>>> = {
  spike: TrendingUp,
  overdue_critical: AlarmClock,
  repeated_reopen: Repeat,
  suspicious_closure: ShieldAlert,
  routing_review_backlog: ListChecks,
  emergency_unconfirmed: Siren,
};

const SEVERITY: Record<Alert['severity'], string> = {
  info: 'border-s-signal',
  warning: 'border-s-warning',
  critical: 'border-s-danger',
};
const ICON_TONE: Record<Alert['severity'], string> = {
  info: 'bg-signal/12 text-signal',
  warning: 'bg-warning/15 text-warning',
  critical: 'bg-danger/12 text-danger',
};

/** One case opens directly; several open as a filtered inbox. */
export function alertTarget(alert: Alert): string {
  if (alert.grievance_ids.length === 1) return `/officer/case/${alert.grievance_ids[0]}`;
  const p = new URLSearchParams();
  if (alert.category) p.set('category', alert.category);
  if (alert.ward_id) p.set('ward', alert.ward_id);
  const qs = p.toString();
  return qs ? `/officer?${qs}` : '/officer';
}

export function AlertCard({
  alert,
  acknowledged,
  onAcknowledge,
  className,
}: {
  alert: Alert;
  acknowledged?: boolean;
  onAcknowledge?: () => void;
  className?: string;
}) {
  const { t } = useTranslation('gov');
  const fmt = useLangFormat();
  const reduced = useReducedMotion();
  const Icon = KIND_ICON[alert.kind];
  return (
    <motion.article
      variants={reduced ? undefined : fadeUp}
      initial="initial"
      animate="animate"
      data-testid="alert-card"
      data-severity={alert.severity}
      className={cn(
        'bg-surface rounded-[var(--radius-md)] border border-s-[3px] p-3',
        SEVERITY[alert.severity],
        acknowledged && 'opacity-60',
        className,
      )}
    >
      <div className="flex gap-2.5">
        <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', ICON_TONE[alert.severity])}>
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-sm leading-snug font-medium">{alert.title_en}</h4>
            <time className="text-muted-foreground shrink-0 text-[11px]" dateTime={alert.created_at}>
              {fmt.relative(alert.created_at)}
            </time>
          </div>
          <p className="text-muted-foreground mt-0.5 text-xs">{alert.detail_en}</p>
          {(alert.category || alert.languages?.length) && (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {alert.category && <DepartmentBadge department={alert.category} size="sm" />}
              {alert.languages?.map((l) => <LangBadge key={l} lang={l} />)}
            </div>
          )}
          <div className="mt-2 flex items-center justify-between gap-2">
            <Link
              to={alertTarget(alert)}
              className="text-signal touch-target inline-flex items-center gap-0.5 text-xs font-medium hover:underline md:min-h-6 md:min-w-0"
            >
              {t('alert.view_cases', { count: alert.grievance_ids.length })}
              <ChevronRight className="rtl-flip size-3.5" aria-hidden />
            </Link>
            {onAcknowledge && (
              <Button
                variant="ghost"
                size="sm"
                className="touch-target md:min-h-7"
                disabled={acknowledged}
                onClick={onAcknowledge}
              >
                <Check className="size-3.5" aria-hidden />
                {acknowledged ? t('alert.acknowledged') : t('alert.acknowledge')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </motion.article>
  );
}
