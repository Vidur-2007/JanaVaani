// StatusChip for government screens. The shared chip's wording addresses the citizen ("Awaiting your check");
// this keeps its look and swaps that one label for the officer's point of view.
import { useTranslation } from 'react-i18next';
import type { Status } from '@contracts/types';
import { StatusChip } from '@/design/components';
import { cn } from '@/lib/utils';

export function GovStatusChip({
  status,
  size = 'sm',
  className,
}: {
  status: Status;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const { t } = useTranslation('gov');
  if (status !== 'resolved_pending_verification') {
    return <StatusChip status={status} size={size} className={className} />;
  }
  return (
    <span
      data-status={status}
      className={cn(
        'bg-ai/12 text-ai border-ai/40 inline-flex shrink-0 items-center rounded-full border font-medium whitespace-nowrap',
        size === 'sm' ? 'h-6 gap-1 px-2 text-[11px]' : 'h-7 gap-1.5 px-2.5 text-xs',
        className,
      )}
    >
      {t(`status.${status}`)}
    </span>
  );
}
