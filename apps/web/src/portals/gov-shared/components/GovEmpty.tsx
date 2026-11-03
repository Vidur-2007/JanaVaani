// Calm empty states: a small drawn city skyline with a tick, in theme tokens. Decorative, so the title carries the meaning.
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

function Skyline() {
  return (
    <svg viewBox="0 0 160 96" className="h-24 w-40" aria-hidden data-testid="empty-art">
      <path d="M8 84h144" stroke="var(--border)" strokeWidth="2" strokeLinecap="round" />
      <g fill="var(--surface-2)" stroke="var(--border)" strokeWidth="1.5">
        <rect x="22" y="48" width="22" height="36" rx="2" />
        <rect x="48" y="30" width="26" height="54" rx="2" />
        <rect x="104" y="42" width="20" height="42" rx="2" />
        <rect x="128" y="58" width="14" height="26" rx="2" />
      </g>
      <g fill="var(--text-muted)" opacity="0.5">
        <rect x="53" y="38" width="5" height="5" rx="1" />
        <rect x="63" y="38" width="5" height="5" rx="1" />
        <rect x="53" y="50" width="5" height="5" rx="1" />
        <rect x="63" y="50" width="5" height="5" rx="1" />
        <rect x="27" y="56" width="4" height="4" rx="1" />
        <rect x="35" y="56" width="4" height="4" rx="1" />
        <rect x="109" y="50" width="4" height="4" rx="1" />
        <rect x="116" y="50" width="4" height="4" rx="1" />
      </g>
      <circle cx="90" cy="30" r="17" fill="var(--bg)" stroke="var(--accent)" strokeWidth="2.5" />
      <path d="m82 30 6 6 11-12" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function GovEmpty({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div role="status" className={cn('flex flex-col items-center gap-3 px-6 py-10 text-center', className)}>
      <Skyline />
      <div className="space-y-1">
        <p className="font-display text-base font-semibold">{title}</p>
        {description && <p className="text-muted-foreground mx-auto max-w-sm text-sm">{description}</p>}
      </div>
      {action}
    </div>
  );
}
