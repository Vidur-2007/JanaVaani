// Titled card used across the case cockpit and review queues.
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Panel({
  title,
  action,
  children,
  className,
  ai,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Indigo treatment, reserved for AI-generated content. */
  ai?: boolean;
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        'bg-surface space-y-3 rounded-[var(--radius-md)] border p-3 md:p-4',
        ai && 'border-ai/35 bg-ai/5',
        className,
      )}
    >
      <header className="flex min-h-7 items-center justify-between gap-2">
        <h2 className="font-display text-sm font-semibold">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}
