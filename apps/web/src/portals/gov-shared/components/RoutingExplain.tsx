// Why a case went where it did: confidence, the votes, and the AI's explanation (Spec C §5.2).
import { useTranslation } from 'react-i18next';
import { Check, TriangleAlert, X } from 'lucide-react';
import type { Routing } from '@contracts/types';
import { AIBadge, DepartmentBadge } from '@/design/components';
import { Progress } from '@/design/ui/progress';
import { useLangFormat } from '@/lib/i18n/useLangFormat';
import { cn } from '@/lib/utils';

export function RoutingExplain({ routing, className }: { routing: Routing; className?: string }) {
  const { t } = useTranslation('gov');
  const fmt = useLangFormat();
  const confidence = Math.round(routing.confidence * 100);
  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <DepartmentBadge department={routing.department} />
        <AIBadge variant={routing.method === 'human' ? 'approved' : 'suggested'} />
      </div>
      <div>
        <div className="mb-1 flex justify-between text-xs">
          <span className="text-muted-foreground">{t('routing.confidence')}</span>
          <span className="tabular font-mono font-medium">{fmt.percent(confidence)}</span>
        </div>
        <Progress value={confidence} aria-label={t('routing.confidence')} className="h-1.5" />
      </div>
      <ul className="space-y-1.5" aria-label={t('routing.votes')}>
        {routing.votes.map((v) => {
          const agrees = v.department === routing.department;
          return (
            <li key={`${v.source}-${v.department}`} className="flex items-center gap-2 text-sm">
              {agrees ? (
                <Check className="text-success size-4 shrink-0" aria-label={t('routing.agrees')} />
              ) : (
                <X className="text-danger size-4 shrink-0" aria-label={t('routing.disagrees')} />
              )}
              <span className="min-w-0 flex-1 truncate">{t(`routing.source.${v.source}`)}</span>
              <DepartmentBadge department={v.department} size="sm" iconOnly />
              {v.confidence != null && (
                <span className="text-muted-foreground tabular w-10 text-end font-mono text-xs">
                  {fmt.percent(Math.round(v.confidence * 100))}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-muted-foreground text-sm">{routing.explanation_en}</p>
      {routing.needs_review && (
        <p className="text-warning flex items-center gap-1.5 text-xs font-medium">
          <TriangleAlert className="size-3.5" aria-hidden />
          {t('routing.needs_review')}
        </p>
      )}
    </div>
  );
}
