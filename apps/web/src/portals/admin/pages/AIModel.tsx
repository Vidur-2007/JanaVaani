// AI model (Spec C §6.8): honest accuracy on synthetic and human-written tests, live ops, versions, retrain.
// #53 returns no macro-F1 for the human set (gap G10), so that tile shows a dash rather than a guess.
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BrainCircuit, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { AIMetrics } from '@contracts/types';
import { Button } from '@/design/ui/button';
import { Progress } from '@/design/ui/progress';
import { ErrorState, KPIStat, PageSkeleton, PageTransition } from '@/design/components';
import { errorMessage } from '@/lib/api/client';
import { api, qk } from '@/lib/api/endpoints';
import { LANGUAGE_NAMES } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useLangFormat } from '@/lib/i18n/useLangFormat';
import { ChartCard } from '@/portals/gov-shared/components/ChartCard';
import { ConfusionMatrix } from '@/portals/gov-shared/components/ConfusionMatrix';
import { Panel } from '@/portals/gov-shared/components/Panel';
import { axisTick, CHART_ANIMATION_MS, tooltipStyle } from '@/portals/gov-shared/lib/chart';

const pct = (x: number) => +(x * 100).toFixed(1);

export default function AIModel() {
  const { t } = useTranslation('gov');
  const fmt = useLangFormat();
  const qc = useQueryClient();
  const [gain, setGain] = useState<number | null>(null);
  const q = useQuery({ queryKey: qk.admin.aiMetrics, queryFn: ({ signal }) => api.aiMetrics(signal) });
  const retrain = useMutation({
    mutationFn: () => api.retrain(),
    onSuccess: (next: AIMetrics) => {
      setGain(q.data ? +(pct(next.accuracy) - pct(q.data.accuracy)).toFixed(1) : null);
      qc.setQueryData(qk.admin.aiMetrics, next);
      toast.success(t('ai.retrained', { version: next.model_version }));
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const languages = useMemo(() => {
    const m = q.data;
    if (!m) return [];
    return Object.entries(m.per_language).map(([code, v]) => ({
      name: code === 'code_mixed' ? t('ai.code_mixed') : (LANGUAGE_NAMES[code as keyof typeof LANGUAGE_NAMES]?.en ?? code),
      synthetic: pct(v!.accuracy),
      human: m.human_test?.per_language[code as keyof typeof m.per_language] ? pct(m.human_test.per_language[code as keyof typeof m.per_language]!.accuracy) : null,
    }));
  }, [q.data, t]);

  if (q.isPending) return <PageSkeleton />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const m = q.data;
  const history = m.history.map((h) => ({ ...h, accuracy_pct: pct(h.accuracy), f1_pct: pct(h.macro_f1) }));
  const live = [
    [t('ai.auto_routed'), fmt.percent(m.live.auto_routed_pct)],
    [t('ai.needs_review'), fmt.percent(m.live.needs_review_pct)],
    [t('ai.agreement'), fmt.percent(pct(m.live.agreement_rate))],
    [t('ai.pipeline_ms'), `${fmt.number(m.live.avg_pipeline_ms)} ms`],
    [t('ai.fallback'), fmt.percent(pct(m.live.fallback_rate))],
    [t('ai.calls'), fmt.number(m.live.calls_24h)],
  ];
  return (
    <PageTransition className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight md:text-2xl">{t('nav.ai')}</h1>
          <p className="text-muted-foreground text-sm">
            <span className="text-text font-mono" data-testid="model-version">{m.model_version}</span>
            {' · '}
            {m.embedding_model}
            {' · '}
            {t('ai.trained', { date: fmt.dateTime(m.trained_at) })}
          </p>
        </div>
        <Button className="min-h-11 md:min-h-9" size="sm" disabled={retrain.isPending} onClick={() => retrain.mutate()} data-testid="retrain">
          <RefreshCw className="size-4" aria-hidden />
          {retrain.isPending ? t('ai.retraining') : t('ai.retrain')}
        </Button>
      </header>
      {retrain.isPending && <Progress value={null} aria-label={t('ai.retraining')} className="h-1.5 animate-pulse" />}
      {gain != null && !retrain.isPending && (
        <p
          className={cn('text-sm font-medium', gain > 0 ? 'text-success' : 'text-muted-foreground')}
          aria-live="polite"
          data-testid="retrain-gain"
        >
          {gain === 0
            ? t('ai.no_change')
            : t('ai.gain', { value: `${gain > 0 ? '+' : ''}${fmt.number(+gain.toFixed(1))}` })}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPIStat label={t('ai.synthetic_accuracy')} value={pct(m.accuracy)} decimals={1} suffix="%" hint={t('ai.n_samples', { count: m.n_test })} />
        <KPIStat label={t('ai.synthetic_f1')} value={pct(m.macro_f1)} decimals={1} suffix="%" />
        <KPIStat label={t('ai.human_accuracy')} value={m.human_test ? pct(m.human_test.accuracy) : 0} format={m.human_test ? undefined : () => '–'} decimals={1} suffix={m.human_test ? '%' : ''} hint={m.human_test ? t('ai.n_samples', { count: m.human_test.n }) : undefined} />
        <KPIStat label={t('ai.human_f1')} value={0} format={() => '–'} hint={t('ai.human_f1_missing')} />
      </div>
      <Panel title={t('ai.how_title')}>
        <p className="text-muted-foreground flex items-start gap-2 text-sm">
          <BrainCircuit className="text-ai mt-0.5 size-4 shrink-0" aria-hidden />
          {t('ai.how_body')}
        </p>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title={t('ai.per_language')}
          unit={t('ai.accuracy_pct')}
          formula={t('ai.per_language_formula')}
          isEmpty={languages.length === 0}
          table={{
            columns: [t('filters.language'), t('ai.synthetic'), t('ai.human')],
            rows: languages.map((l) => [l.name, l.synthetic, l.human ?? '–']),
          }}
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={languages} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" tick={axisTick} tickLine={false} minTickGap={4} />
              <YAxis domain={[0, 100]} tick={axisTick} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: 'var(--surface-2)' }} contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="synthetic" name={t('ai.synthetic')} fill="var(--accent)" animationDuration={CHART_ANIMATION_MS} />
              <Bar dataKey="human" name={t('ai.human')} fill="var(--primary)" animationDuration={CHART_ANIMATION_MS} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard
          title={t('ai.history')}
          unit={t('ai.accuracy_pct')}
          formula={t('ai.history_formula')}
          isEmpty={history.length === 0}
          table={{
            columns: [t('ai.version'), t('ai.accuracy'), t('ai.macro_f1'), t('ai.corrections')],
            rows: history.map((h) => [h.model_version, h.accuracy_pct, h.f1_pct, h.corrections_used]),
          }}
        >
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={history} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="model_version" tick={axisTick} tickLine={false} />
              <YAxis domain={['auto', 'auto']} tick={axisTick} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line dataKey="accuracy_pct" name={t('ai.accuracy')} stroke="var(--accent)" strokeWidth={2} animationDuration={CHART_ANIMATION_MS} />
              <Line dataKey="f1_pct" name={t('ai.macro_f1')} stroke="var(--primary)" strokeWidth={2} animationDuration={CHART_ANIMATION_MS} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <Panel title={t('ai.confusion')}>
          <ConfusionMatrix labels={m.confusion.labels} matrix={m.confusion.matrix} />
        </Panel>
        <Panel title={t('ai.live_ops')}>
          <dl className="space-y-2 text-sm">
            {live.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="tabular font-mono">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>
      <Panel title={t('ai.versions')}>
        <ul className="divide-y text-sm" data-testid="version-list">
          {[...m.history].reverse().map((h) => (
            <li key={h.model_version} data-testid="version-row" className="flex flex-wrap justify-between gap-2 py-1.5">
              <span className="font-mono">{h.model_version}</span>
              <span className="text-muted-foreground tabular text-xs">
                {fmt.percent(pct(h.accuracy))} · {t('ai.corrections_used', { count: h.corrections_used })}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </PageTransition>
  );
}
