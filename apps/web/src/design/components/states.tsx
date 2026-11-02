// Screen states (golden rule 7): EmptyState, ErrorState, LiveIndicator.
import type { ComponentType, ReactNode, SVGProps } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Inbox, RotateCw } from 'lucide-react';
import { Button } from '@/design/ui/button';
import { errorMessage } from '@/lib/api/client';
import { useLiveConnection } from '@/lib/live/useLiveEvents';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-3 px-6 py-12 text-center', className)}
      role="status"
    >
      <div className="bg-surface-2 grid size-14 place-items-center rounded-2xl">
        <Icon className="text-muted-foreground size-7" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="font-display text-base font-semibold">{title}</p>
        {description && <p className="text-muted-foreground mx-auto max-w-sm text-sm">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export interface ErrorStateProps {
  error?: unknown;
  title?: string;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}

export function ErrorState({ error, title, onRetry, className, compact }: ErrorStateProps) {
  const { t } = useTranslation('common');
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 text-center',
        compact ? 'p-4' : 'px-6 py-12',
        className,
      )}
      role="alert"
      data-testid="error-state"
    >
      <div className="bg-danger/12 grid size-12 place-items-center rounded-2xl">
        <AlertTriangle className="text-danger size-6" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="font-display font-semibold">{title ?? t('errors.generic_title')}</p>
        {error != null && (
          <p className="text-muted-foreground mx-auto max-w-sm text-sm break-words">{errorMessage(error)}</p>
        )}
      </div>
      {onRetry && (
        <Button variant="outline" onClick={onRetry} className="touch-target">
          <RotateCw className="size-4" aria-hidden />
          {t('actions.retry')}
        </Button>
      )}
    </div>
  );
}

/** Realtime status dot: green "Live" when connected, teal "Auto-refresh" when polling. */
export function LiveIndicator({ className, label }: { className?: string; label?: string }) {
  const { t } = useTranslation('common');
  const conn = useLiveConnection();
  const color =
    conn === 'live'
      ? 'bg-success'
      : conn === 'polling'
        ? 'bg-signal'
        : conn === 'offline'
          ? 'bg-danger'
          : 'bg-warning';
  return (
    <span
      className={cn('text-muted-foreground inline-flex items-center gap-2 text-xs font-medium', className)}
      aria-live="polite"
    >
      <span className="relative flex size-2.5">
        {(conn === 'live' || conn === 'polling') && (
          <span className={cn('absolute inset-0 rounded-full opacity-60 motion-safe:animate-ping', color)} />
        )}
        <span className={cn('relative size-2.5 rounded-full', color)} />
      </span>
      {label ?? t(`live.${conn}`)}
    </span>
  );
}
