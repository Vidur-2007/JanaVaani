// Live city stats from GET /public/stats: count-ups + a mini department bar list.
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { CheckCircle2, Clock, FileText } from 'lucide-react';
import { DepartmentBadge, ErrorState, KPIStat, LiveIndicator, Skeleton, StatSkeleton } from '@/design/components';
import { easeOutExpo, reveal } from '@/design/motion';
import { api, qk } from '@/lib/api/endpoints';
import { useLangFormat } from '@/lib/i18n/useLangFormat';

export function LiveStats() {
  const { t } = useTranslation('landing');
  const fmt = useLangFormat();
  const q = useQuery({ queryKey: qk.public.stats, queryFn: ({ signal }) => api.publicStats(signal), refetchInterval: 60_000 });
  const depts = q.data ? [...q.data.by_department].sort((a, b) => b.total - a.total).slice(0, 6) : [];
  const max = Math.max(1, ...depts.map((d) => d.total));

  return (
    <motion.section {...reveal} className="mx-auto max-w-6xl px-4 py-20" aria-labelledby="stats-title" data-testid="live-stats">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <h2 id="stats-title" className="font-display text-3xl font-semibold md:text-4xl">
          {t('stats.title')}
        </h2>
        <LiveIndicator />
      </div>
      {q.isPending ? (
        <div className="grid gap-3 md:grid-cols-3">
          <StatSkeleton />
          <StatSkeleton />
          <StatSkeleton />
          <Skeleton className="h-48 md:col-span-3" />
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} compact />
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          <KPIStat label={t('stats.total')} value={q.data.total} icon={FileText} />
          <KPIStat label={t('stats.resolved')} value={q.data.resolution_rate_pct} decimals={1} suffix="%" icon={CheckCircle2} />
          <KPIStat label={t('stats.avg_hours')} value={q.data.avg_resolution_hours} format={(n) => fmt.duration(n * 60)} icon={Clock} />
          <div className="bg-surface rounded-[var(--radius-lg)] border p-4 md:col-span-3">
            <p className="text-muted-foreground mb-3 text-xs font-medium">{t('stats.by_department')}</p>
            <ul className="space-y-2.5">
              {depts.map((d, i) => (
                <li key={d.department_id} className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-2 sm:grid-cols-[minmax(0,10rem)_1fr_auto] sm:gap-3">
                  <DepartmentBadge department={d.department_id} size="sm" className="max-w-full justify-self-start" />
                  <span className="bg-surface-2 h-2 overflow-hidden rounded-full">
                    <motion.span
                      className="block h-full rounded-full"
                      style={{ background: `var(--dept-${d.department_id})` }}
                      initial={{ width: 0 }}
                      whileInView={{ width: `${(d.total / max) * 100}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.9, delay: i * 0.06, ease: easeOutExpo }}
                    />
                  </span>
                  <span className="tabular text-muted-foreground text-end font-mono text-xs whitespace-nowrap">
                    {fmt.number(d.total)} · {d.resolved_pct}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </motion.section>
  );
}
