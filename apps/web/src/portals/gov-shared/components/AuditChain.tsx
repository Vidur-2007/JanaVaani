// Hash-chain check: links light up in order, green, or red at the first broken event. `blocks` shows each event with
// its short hashes for /admin/audit; the compact form sits on the case page. `verify` is exposed for the `v` shortcut.
import { Fragment, useEffect, useImperativeHandle, useState, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, Check, Link2, ShieldCheck, ShieldX, X } from 'lucide-react';
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

/** Walks prev_hash links, so ties in created_at can't scramble the order. */
export function orderChain(events: TimelineEvent[]) {
  const byPrev = new Map(events.map((e) => [e.prev_hash, e]));
  const ordered: TimelineEvent[] = [];
  let next = byPrev.get(null);
  while (next && ordered.length < events.length) {
    ordered.push(next);
    next = byPrev.get(next.hash);
  }
  // A partial page has no head to start from; fall back to time order.
  return ordered.length === events.length
    ? ordered
    : [...events].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}

const short = (h: string | null) => (h ? h.slice(0, 8) : '—');

export function AuditChain({
  grievanceId,
  events,
  blocks,
  ref,
}: {
  grievanceId: string;
  events: TimelineEvent[];
  blocks?: boolean;
  ref?: Ref<AuditChainHandle>;
}) {
  const { t } = useTranslation('gov');
  const { t: tc } = useTranslation('common');
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
  const tone = (i: number) =>
    i < step && i === broken
      ? 'border-danger bg-danger/20 text-danger'
      : i < step
        ? 'border-success/60 bg-success/15 text-success'
        : 'text-muted-foreground';

  return (
    <div className="space-y-2">
      {blocks ? (
        <ol className="flex flex-wrap items-center gap-1.5" data-testid="chain-blocks">
          {events.map((e, i) => (
            <Fragment key={e.id}>
              <li
                data-state={i < step ? (i === broken ? 'broken' : 'ok') : 'idle'}
                className={cn('w-36 rounded-[var(--radius-sm)] border p-2 transition-colors duration-150', tone(i))}
              >
                <p className="flex items-center justify-between gap-1 text-[11px] font-medium">
                  <span className="truncate">{tc(`timeline.types.${e.type}`, { defaultValue: e.type })}</span>
                  {i < step &&
                    (i === broken ? (
                      <X className="size-3.5 shrink-0" aria-label={t('audit.broken_here')} />
                    ) : (
                      <Check className="size-3.5 shrink-0" aria-label={t('audit.link_ok')} />
                    ))}
                </p>
                <p className="tabular font-mono text-[10px]" title={e.hash}>
                  #{short(e.hash)}
                </p>
                <p className="tabular font-mono text-[10px] opacity-70" title={e.prev_hash ?? undefined}>
                  ← {short(e.prev_hash)}
                </p>
              </li>
              {i < events.length - 1 && (
                <ArrowRight className="rtl-flip text-muted-foreground size-3.5 shrink-0" aria-hidden />
              )}
            </Fragment>
          ))}
        </ol>
      ) : (
        <div className="flex flex-wrap items-center gap-1" aria-hidden>
          {events.map((e, i) => (
            <span
              key={e.id}
              title={e.hash}
              className={cn('grid size-6 place-items-center rounded border transition-colors duration-150', tone(i))}
            >
              <Link2 className="size-3" />
            </span>
          ))}
        </div>
      )}
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
