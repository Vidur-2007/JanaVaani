// The pieces of an inbox row (Spec C §5.1), shared by the table cells and the mobile card.
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { RotateCcw, ShieldAlert, Siren, TriangleAlert, Users } from 'lucide-react';
import type { Grievance } from '@contracts/types';
import { Checkbox } from '@/design/ui/checkbox';
import { DepartmentBadge, LangBadge, PriorityChip } from '@/design/components';
import { useLangFormat } from '@/lib/i18n/useLangFormat';
import { cn } from '@/lib/utils';
import { GovStatusChip } from '@/portals/gov-shared/components/GovStatusChip';
import { SLACountdownGov } from '@/portals/gov-shared/components/SLACountdownGov';
import { isSuspiciousClosure } from '@/portals/gov-shared/lib/inbox';

const flagCls =
  'inline-flex h-5 items-center gap-1 rounded-full px-1.5 text-[11px] font-medium whitespace-nowrap';

export function CaseFlags({ g }: { g: Grievance }) {
  const { t } = useTranslation('gov');
  return (
    <>
      {g.is_emergency && (
        <span data-flag="emergency" className={cn(flagCls, 'bg-danger/12 text-danger')}>
          <Siren className="size-3" aria-hidden />
          {t('inbox.flag.emergency')}
        </span>
      )}
      {g.routing.needs_review && (
        <span data-flag="needs_review" className={cn(flagCls, 'bg-warning/15 text-warning')}>
          <TriangleAlert className="size-3" aria-hidden />
          {t('inbox.flag.needs_review')}
        </span>
      )}
      {isSuspiciousClosure(g) && (
        <span data-flag="suspicious" className={cn(flagCls, 'bg-danger/12 text-danger')}>
          <ShieldAlert className="size-3" aria-hidden />
          {t('inbox.flag.suspicious')}
        </span>
      )}
      {g.reopen_count > 0 && (
        <span data-flag="reopened" className={cn(flagCls, 'bg-warning/15 text-warning')}>
          <RotateCcw className="size-3" aria-hidden />
          {t('inbox.flag.reopened', { count: g.reopen_count })}
        </span>
      )}
    </>
  );
}

export function EscalationDots({ level }: { level: Grievance['escalation_level'] }) {
  const { t } = useTranslation('gov');
  return (
    <span
      className="inline-flex items-center gap-1"
      role="img"
      aria-label={t('inbox.escalation_level', { level })}
      title={t('inbox.escalation_level', { level })}
    >
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          className={cn(
            'size-1.5 rounded-full',
            n <= level ? (level >= 2 ? 'bg-danger' : 'bg-warning') : 'bg-border',
          )}
        />
      ))}
    </span>
  );
}

export function CaseTitle({ g }: { g: Grievance }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <Link
          to={`/officer/case/${g.id}`}
          onClick={(e) => e.stopPropagation()}
          className="hover:text-primary truncate font-medium"
        >
          <bdi lang="en">{g.title.en}</bdi>
        </Link>
        {g.language !== 'en' && <LangBadge lang={g.language} codeMixed={g.is_code_mixed} />}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground tabular font-mono text-[11px]">{g.id}</span>
        <CaseFlags g={g} />
      </div>
    </div>
  );
}

export function CaseCard({
  g,
  selected,
  onToggle,
  selectable,
}: {
  g: Grievance;
  selected: boolean;
  onToggle: () => void;
  selectable: boolean;
}) {
  const { t } = useTranslation('gov');
  const fmt = useLangFormat();
  return (
    <article
      data-testid="case-card"
      className={cn(
        'bg-surface space-y-2 rounded-[var(--radius-md)] border p-3',
        selected && 'border-primary/60',
      )}
    >
      <div className="flex items-center gap-2">
        {selectable && (
          <span className="-ms-2 -my-2 grid min-h-11 min-w-11 place-items-center">
            <Checkbox
              checked={selected}
              onCheckedChange={onToggle}
              aria-label={t('table.select_row', { id: g.id })}
            />
          </span>
        )}
        <PriorityChip priority={g.priority} score={g.priority_score} size="sm" />
        <GovStatusChip status={g.status} className="ms-auto" />
      </div>
      <CaseTitle g={g} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <DepartmentBadge department={g.category} size="sm" />
        <span className="text-muted-foreground truncate">{g.location.ward_name}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <SLACountdownGov grievance={g} />
        <span className="flex items-center gap-3">
          {g.support_count > 0 && (
            <span className="text-muted-foreground tabular inline-flex items-center gap-1 text-xs">
              <Users className="size-3.5" aria-hidden />
              <span className="sr-only">{t('inbox.column.support')}</span>
              {fmt.number(g.support_count)}
            </span>
          )}
          <EscalationDots level={g.escalation_level} />
        </span>
      </div>
    </article>
  );
}
