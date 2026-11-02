// SLA countdown for gov lists. Closed-out cases stop counting; amber and red come from the shared SLACountdown.
import type { Grievance } from '@contracts/types';
import { SLACountdown } from '@/design/components';
import { isOpenStatus } from '../lib/inbox';

export function SLACountdownGov({
  grievance,
  compact = true,
  className,
}: {
  grievance: Pick<Grievance, 'sla' | 'status'>;
  compact?: boolean;
  className?: string;
}) {
  const stopped =
    !isOpenStatus(grievance.status) || grievance.status === 'resolved_pending_verification';
  return <SLACountdown sla={grievance.sla} stopped={stopped} compact={compact} className={className} />;
}
