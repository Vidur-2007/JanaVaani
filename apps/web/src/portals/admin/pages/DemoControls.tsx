// Demo controls (Spec C §6.10): virtual clock, reset, provider health, API mode. Route exists only with VITE_DEMO_MODE.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/design/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/design/ui/dialog';
import { ErrorState, PageTransition, TextSkeleton } from '@/design/components';
import { API_MODE, errorMessage, useMockFallbacks } from '@/lib/api/client';
import { api, qk } from '@/lib/api/endpoints';
import { useLangFormat } from '@/lib/i18n/useLangFormat';
import { cn } from '@/lib/utils';
import { Panel } from '@/portals/gov-shared/components/Panel';
import type { ClockResult } from '@/portals/gov-shared/types-ext';

const JUMPS = [6, 24, 48];
const HEALTHY = ['ok', 'loaded', 'mock', 'available', 'semantic'];

export default function DemoControls() {
  const { t } = useTranslation('gov');
  const { t: tc } = useTranslation('common');
  const fmt = useLangFormat();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const fallbacks = useMockFallbacks((s) => s.count);
  const clock = useQuery({ queryKey: qk.admin.demoClock, queryFn: ({ signal }) => api.demoClock(signal) });
  const health = useQuery({ queryKey: qk.health, queryFn: ({ signal }) => api.health(signal) });

  const refreshAll = () => qc.invalidateQueries({ queryKey: qk.all });
  const advance = useMutation({
    mutationFn: async (hours: number) => {
      const before = (await api.alerts()).length;
      const result = (await api.advanceDemoClock(hours)) as ClockResult;
      const after = (await api.alerts()).length;
      return { result, newAlerts: after - before };
    },
    onSuccess: ({ result, newAlerts }) => {
      const e = result.escalations;
      const fired = e ? e.escalated_l1 + e.escalated_l2 : newAlerts;
      toast.success(t('demo.fired', { count: fired }));
      refreshAll();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const reset = useMutation({
    mutationFn: () => api.demoReset(),
    onSuccess: () => {
      setConfirming(false);
      toast.success(t('demo.reset_done'));
      refreshAll();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <PageTransition className="space-y-3">
      <h1 className="font-display text-xl font-semibold tracking-tight md:text-2xl">{t('nav.demo')}</h1>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title={t('demo.clock')}>
          {clock.isPending ? (
            <TextSkeleton lines={1} />
          ) : clock.isError ? (
            <ErrorState compact error={clock.error} onRetry={() => clock.refetch()} />
          ) : (
            <p className="flex items-center gap-2 text-sm">
              <Clock className="text-muted-foreground size-4" aria-hidden />
              <span className="tabular font-mono" data-testid="virtual-now">{fmt.dateTime(clock.data.now)}</span>
              <span className="text-muted-foreground text-xs">
                {t('demo.offset', { hours: fmt.number(Math.round(clock.data.offset_minutes / 60)) })}
              </span>
            </p>
          )}
          <div className="flex gap-2">
            {JUMPS.map((h) => (
              <Button
                key={h}
                variant="outline"
                size="sm"
                className="min-h-11 flex-1 md:min-h-9"
                disabled={advance.isPending}
                onClick={() => advance.mutate(h)}
                data-testid={`advance-${h}`}
              >
                +{h}h
              </Button>
            ))}
          </div>
        </Panel>
        <Panel title={t('demo.data')}>
          <p className="text-muted-foreground text-sm">{t('demo.reset_hint')}</p>
          <Button variant="destructive" size="sm" className="min-h-11 md:min-h-9" onClick={() => setConfirming(true)} data-testid="reset-open">
            <RotateCcw className="size-4" aria-hidden />
            {t('demo.reset')}
          </Button>
        </Panel>
        <Panel title={t('demo.health')}>
          {health.isPending ? (
            <TextSkeleton lines={3} />
          ) : health.isError ? (
            <ErrorState compact error={health.error} onRetry={() => health.refetch()} />
          ) : (
            <dl className="space-y-1 text-sm" data-testid="provider-health">
              {Object.entries(health.data.providers).map(([name, state]) => (
                <div key={name} className="flex justify-between gap-2">
                  <dt className="capitalize">{name}</dt>
                  <dd className={cn('font-mono text-xs', HEALTHY.includes(String(state)) ? 'text-success' : 'text-warning')}>
                    {String(state)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </Panel>
        <Panel title={t('demo.mode')}>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-2">
              <dt>{t('demo.api_mode')}</dt>
              <dd className="font-mono text-xs" data-testid="api-mode">{API_MODE}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>{t('demo.fallbacks')}</dt>
              <dd className="tabular font-mono text-xs" data-testid="fallback-count">{fmt.number(fallbacks)}</dd>
            </div>
          </dl>
        </Panel>
      </div>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('demo.reset_confirm')}</DialogTitle>
            <DialogDescription>{t('demo.reset_body')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" className="min-h-11" onClick={() => setConfirming(false)}>
              {tc('actions.cancel')}
            </Button>
            <Button variant="destructive" className="min-h-11" disabled={reset.isPending} onClick={() => reset.mutate()} data-testid="reset-confirm">
              {t('demo.reset')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageTransition>
  );
}
