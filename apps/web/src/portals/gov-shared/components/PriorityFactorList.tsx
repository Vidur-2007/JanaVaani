// Explainable priority: each factor with its points, summing to the score (master §7).
import { useTranslation } from 'react-i18next';
import type { PriorityFactor } from '@contracts/types';
import { cn } from '@/lib/utils';

export function PriorityFactorList({
  factors,
  score,
  className,
}: {
  factors: PriorityFactor[];
  score: number;
  className?: string;
}) {
  const { t } = useTranslation('gov');
  const max = Math.max(1, ...factors.map((f) => f.points));
  return (
    <div className={cn('space-y-2', className)}>
      <ul className="space-y-1.5">
        {factors.map((f) => (
          <li key={f.key} className="text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0">{f.label_en}</span>
              <span className="tabular font-mono text-xs font-medium">+{f.points}</span>
            </div>
            <div className="bg-surface-2 mt-1 h-1 overflow-hidden rounded-full" aria-hidden>
              <div
                className="bg-primary h-full origin-left rounded-full rtl:origin-right"
                style={{ transform: `scaleX(${f.points / max})` }}
              />
            </div>
          </li>
        ))}
      </ul>
      <p className="flex items-baseline justify-between border-t pt-2 text-sm font-medium">
        <span>{t('priority_card.total')}</span>
        <span className="tabular font-mono">{score}</span>
      </p>
    </div>
  );
}
