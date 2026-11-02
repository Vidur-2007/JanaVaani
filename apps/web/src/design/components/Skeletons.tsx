// Loading skeletons (golden rule 7). Built on the shadcn Skeleton.
import { Skeleton } from '@/design/ui/skeleton';
import { cn } from '@/lib/utils';

export { Skeleton };

export function TextSkeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className="h-3.5" style={{ width: `${i === lines - 1 ? 60 : 100 - i * 6}%` }} />
      ))}
    </div>
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('bg-surface space-y-3 rounded-[var(--radius-lg)] border p-4', className)} aria-hidden>
      <div className="flex items-center gap-2">
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
      <Skeleton className="h-5 w-3/4" />
      <TextSkeleton lines={2} />
    </div>
  );
}

export function ListSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)} role="status" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

export function StatSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('bg-surface space-y-2 rounded-[var(--radius-lg)] border p-4', className)} aria-hidden>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-20" />
    </div>
  );
}

export function PageSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('mx-auto w-full max-w-5xl space-y-6 p-4 md:p-8', className)}
      role="status"
      aria-busy="true"
    >
      <Skeleton className="h-8 w-1/3" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <StatSkeleton key={i} />
        ))}
      </div>
      <ListSkeleton rows={3} />
    </div>
  );
}
