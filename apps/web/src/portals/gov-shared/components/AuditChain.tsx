// Compact hash-chain check for one case: links light up in order, green, or red at the first broken event.
// Exposes `verify` through a ref so the `v` shortcut can trigger it. P4 adds the full block view for /admin/audit.
import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Link2, ShieldCheck, ShieldX } from 'lucide-react';
import type { AuditVerification, TimelineEvent } from '@contracts/types';
import { Button } from '@/design/ui/button';
import { api } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/api/client';
import { useReducedMotion } from '@/lib/prefs/store';
import { cn } from '@/lib/utils';

const STEP_MS = 90;

export interface AuditChainHandle {
  verify: () => void;
}

export function AuditChain({
  grievanceId,
  events,
  ref,
}: {
  grievanceId: string;
  events: TimelineEvent[];
  ref?: Ref<AuditChainHandle>;
}) {
  const { t } = useTranslation('gov');
  const reduced = useReducedMotion();
  const [result, setResult] = useState<AuditVerification | null>(null);
  const [step, setStep] = useState(0);
  const check = useMutation({
    mutationFn: () => api.auditVerify({ grievance_id: grievanceId }),
    onMutate: () => {
      setResult(null);
      setStep(0);
    },
    onSuccess: setResult,
  });
  useImperativeHandle(ref, () => ({ verify: () => check.mutate() }), [check]);

  const broken = result?.first_broken_event_id
    ? events.findIndex((e) => e.id === result.first_broken_event_id)
    : -1;
  const last = broken >= 0 ? broken : events.length - 1;

  useEffect(() => {
    if (!result) return;
    if (reduced) {
      setStep(last + 1);
      return;
    }
    const id = window.setInterval(
      () =>
        setStep((s) => {
          if (s > last) window.clearInterval(id);
          return Math.min(s + 1, last + 1);
        }),
      STEP_MS,
    );
    return () => window.clearInterval(id);
  }, [result, last, reduced]);

  const done = !!result && step > last;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1" aria-hidden>
        {events.map((e, i) => (
          <span
            key={e.id}
            title={e.hash}
            className={cn(
              'grid size-6 place-items-center rounded border transition-colors duration-150',
              i < step && i === broken
                ? 'border-danger bg-danger/20 text-danger'
                : i < step
                  ? 'border-success/60 bg-success/15 text-success'
                  : 'text-muted-foreground',
            )}
          >
            <Link2 className="size-3" />
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs" aria-live="polite" data-testid="chain-result">
          {check.isError && <span className="text-danger">{errorMessage(check.error)}</span>}
          {done && result.valid && (
            <span className="text-success inline-flex items-center gap-1 font-medium">
              <ShieldCheck className="size-3.5" aria-hidden />
              {t('audit.valid', { count: result.events_checked })}
            </span>
          )}
          {done && !result.valid && (
            <span className="text-danger inline-flex items-center gap-1 font-medium">
              <ShieldX className="size-3.5" aria-hidden />
              {t('audit.broken')}
            </span>
          )}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="min-h-11 min-w-11 md:min-h-8 md:min-w-0"
          disabled={check.isPending}
          onClick={() => check.mutate()}
          aria-keyshortcuts="v"
        >
          <Link2 className="size-4" aria-hidden />
          {t('audit.verify')}
        </Button>
      </div>
    </div>
  );
}
