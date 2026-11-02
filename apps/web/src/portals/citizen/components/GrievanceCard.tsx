import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Users } from 'lucide-react';
import type { Grievance } from '@contracts/types';
import { DepartmentBadge, PriorityChip, SLACountdown, StatusChip } from '@/design/components';
import { pickLocalized } from '@/lib/localized';

const STOPPED = ['closed', 'rejected', 'merged', 'resolved_pending_verification'];

export function GrievanceCard({ g, to }: { g: Grievance; to?: string }) {
  const { i18n } = useTranslation();
  const title = pickLocalized(g.title, i18n.language);
  return (
    <Link
      to={to ?? `/app/complaints/${g.id}`}
      className="bg-surface hover:border-primary/40 group block rounded-[var(--radius-lg)] border p-4 transition-colors"
      data-testid="grievance-card"
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip status={g.status} size="sm" />
        <PriorityChip priority={g.priority} size="sm" />
        <DepartmentBadge department={g.category} size="sm" />
      </div>
      <div className="mt-2 flex items-start justify-between gap-3">
        <p className="font-medium" lang={title.lang} dir={title.dir}>
          {title.text}
        </p>
        <ChevronRight className="rtl-flip text-muted-foreground mt-0.5 size-5 shrink-0" aria-hidden />
      </div>
      <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="font-mono">{g.id}</span>
        {g.location.ward_name && <span>{g.location.ward_name}</span>}
        {g.support_count > 0 && (
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" aria-hidden />
            {g.support_count}
          </span>
        )}
        <SLACountdown sla={g.sla} stopped={STOPPED.includes(g.status)} compact />
      </div>
    </Link>
  );
}
