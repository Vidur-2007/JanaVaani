// Case identity strip shared by the cockpit and queue cards.
import type { ReactNode } from 'react';
import type { Grievance } from '@contracts/types';
import { DepartmentBadge, PriorityChip } from '@/design/components';
import { GovStatusChip } from './GovStatusChip';

export function CaseHeader({ grievance: g, flags, asHeading = true }: { grievance: Grievance; flags?: ReactNode; asHeading?: boolean }) {
  const Title = asHeading ? 'h1' : 'h3';
  return (
    <header className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <PriorityChip priority={g.priority} score={g.priority_score} size="sm" />
        <GovStatusChip status={g.status} />
        <DepartmentBadge department={g.category} size="sm" />
        {flags}
      </div>
      <Title className={asHeading ? 'font-display text-xl font-semibold tracking-tight md:text-2xl' : 'font-display text-sm font-semibold'}>
        {g.title.en}
      </Title>
      <p className="text-muted-foreground tabular font-mono text-xs">
        {g.id}
        {g.location.ward_name && <span className="font-sans"> · {g.location.ward_name}</span>}
      </p>
    </header>
  );
}
