// Public transparency portal (Spec C §7): proof of accountability, with no login and no personal data.
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ShieldCheck } from 'lucide-react';
import type { DepartmentId } from '@contracts/types';
import { Button } from '@/design/ui/button';
import {
  BeforeAfterSlider,
  DepartmentBadge,
  EmptyState,
  ErrorState,
  KPIStat,
  LanguageSwitcher,
  Logo,
  PageTransition,
  StatSkeleton,
  ThemeToggle,
} from '@/design/components';
import { api, qk } from '@/lib/api/endpoints';
import { useLangFormat } from '@/lib/i18n/useLangFormat';
import { useSurfaceTheme } from '@/lib/prefs/store';
import { cn } from '@/lib/utils';
import { ChartCard } from '@/portals/gov-shared/components/ChartCard';
import { GovMap } from '@/portals/gov-shared/components/GovMap';
import { Sparkline } from '@/portals/gov-shared/components/Sparkline';
import { axisTick, CHART_ANIMATION_MS, tooltipStyle } from '@/portals/gov-shared/lib/chart';
import { mediaUrl } from '@/portals/gov-shared/lib/inbox';

const FILTERS: DepartmentId[] = ['roads', 'water', 'drainage', 'sanitation', 'streetlights', 'power'];

function Heatmap() {
  const { t } = useTranslation('gov');
  const { t: tc } = useTranslation('common');
  const [category, setCategory] = useState<DepartmentId | undefined>();
  const q = useQuery({
    queryKey: qk.public.map({ category }),
    queryFn: ({ signal }) => api.publicMap({ category }, signal),
    placeholderData: (prev) => prev,
  });
  const chip = (active: boolean) =>
    cn('min-h-11 md:min-h-9', active && 'border-primary text-primary');
  return (
    <section aria-labelledby="public-map" className="space-y-3">
      <h2 id="public-map" className="font-display text-xl font-semibold">
        {t('public.map_title')}
      </h2>
      <div className="flex flex-wrap gap-1" role="group" aria-label={t('filters.department')}>
        <Button variant="outline" size="sm" className={chip(!category)} aria-pressed={!category} onClick={() => setCategory(undefined)}>
          {t('filters.all')}
        </Button>
        {FILTERS.map((d) => (
          <Button key={d} variant="outline" size="sm" className={chip(category === d)} aria-pressed={category === d} onClick={() => setCategory(d)}>
            {tc(`departments.${d}`)}
          </Button>
        ))}
      </div>
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <GovMap points={q.data} defaultLayers={['heat']} availableLayers={['heat']} height="min(55dvh, 460px)" scrollWheelZoom={false} />
      )}
      <p className="text-muted-foreground flex items-start gap-2 text-sm">
        <ShieldCheck className="text-success mt-0.5 size-4 shrink-0" aria-hidden />
        {t('public.map_note')}
      </p>
    </section>
  );
}

export default function PublicPortal() {
  useSurfaceTheme('paper');
  const { t } = useTranslation('gov');
  const { t: tc } = useTranslation('common');
  const fmt = useLangFormat();
  const q = useQuery({ queryKey: qk.public.stats, queryFn: ({ signal }) => api.publicStats(signal) });
  const stats = q.data;
  const fixed = useMemo(
    () => (stats?.recent_resolved ?? []).filter((r) => r.before_url && r.after_url),
    [stats],
  );
  const zones = stats?.by_zone ?? [];
  return (
    <div className="min-h-dvh">
      <header className="bg-surface/90 sticky top-0 z-[700] border-b backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-2">
          <Link to="/" aria-label={t('public.home')}>
            <Logo />
          </Link>
          <div className="flex items-center gap-1">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main id="main" data-testid="public-portal">
        <PageTransition className="mx-auto max-w-6xl space-y-10 px-4 py-8">
          <section aria-labelledby="public-title" className="space-y-4">
            <div className="space-y-2">
              <h1 id="public-title" className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
                {t('public.title')}
              </h1>
              <p className="text-muted-foreground max-w-2xl">{t('public.subtitle')}</p>
            </div>
            {q.isError ? (
              <ErrorState error={q.error} onRetry={() => q.refetch()} />
            ) : (
              <div className="grid gap-3 sm:grid-cols-3" data-testid="public-hero">
                {!stats ? (
                  [0, 1, 2].map((i) => <StatSkeleton key={i} />)
                ) : (
                  <>
                    <KPIStat label={t('public.resolution_rate')} value={stats.resolution_rate_pct} decimals={1} suffix="%" />
                    <KPIStat label={t('public.avg_time')} value={stats.avg_resolution_hours} decimals={1} suffix={` ${t('public.hours')}`} />
                    <KPIStat label={t('public.total_resolved')} value={stats.resolved} />
                  </>
                )}
              </div>
            )}
          </section>

          <Heatmap />

          {stats && (
            <section aria-labelledby="public-depts" className="space-y-3">
              <h2 id="public-depts" className="font-display text-xl font-semibold">
                {t('public.departments_title')}
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {stats.by_department.map((d) => (
                  <li key={d.department_id} data-testid="report-card" className="bg-surface space-y-2 rounded-[var(--radius-lg)] border p-4">
                    <DepartmentBadge department={d.department_id} size="sm" />
                    <p className="font-display tabular text-2xl font-semibold">{fmt.percent(d.resolved_pct)}</p>
                    <p className="text-muted-foreground text-xs">
                      {t('public.resolved_of', { count: d.total })} · {t('public.avg_hours', { value: fmt.number(d.avg_resolution_hours) })}
                    </p>
                    <Sparkline
                      data={stats.trend.map((p) => p.by_category?.[d.department_id] ?? 0)}
                      color={`var(--dept-${d.department_id})`}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {stats && (
            <ChartCard
              title={t('public.zones_title')}
              unit={t('public.zones_unit')}
              formula={t('public.zones_formula')}
              isEmpty={zones.length === 0}
              table={{
                columns: [t('filters.zones'), t('public.resolution_rate'), t('kpi.total')],
                rows: zones.map((z) => [z.zone, z.resolved_pct, z.total]),
              }}
            >
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={zones} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="zone" tick={axisTick} tickLine={false} interval={0} />
                  <YAxis domain={[0, 100]} tick={axisTick} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: 'var(--surface-2)' }} contentStyle={tooltipStyle} />
                  <Bar dataKey="resolved_pct" name={t('public.resolution_rate')} fill="var(--accent)" radius={[4, 4, 0, 0]} animationDuration={CHART_ANIMATION_MS} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {stats && (
            <section aria-labelledby="public-fixed" className="space-y-3">
              <h2 id="public-fixed" className="font-display text-xl font-semibold">
                {t('public.fixed_title')}
              </h2>
              {fixed.length === 0 ? (
                <EmptyState title={t('public.fixed_empty')} />
              ) : (
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {fixed.map((r) => (
                    <li key={`${r.title_en}-${r.resolved_at}`} data-testid="fixed-card" className="space-y-2">
                      <BeforeAfterSlider before={mediaUrl(r.before_url!)} after={mediaUrl(r.after_url!)} />
                      <p className="text-sm font-medium">{r.title_en}</p>
                      <p className="text-muted-foreground flex items-center gap-2 text-xs">
                        {tc(`departments.${r.category}`)} · {r.zone} · {fmt.date(r.resolved_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section aria-labelledby="public-method" className="bg-surface space-y-3 rounded-[var(--radius-lg)] border p-5" data-testid="methodology">
            <h2 id="public-method" className="font-display text-xl font-semibold">
              {t('public.method_title')}
            </h2>
            <ul className="list-disc space-y-1.5 ps-5 text-sm">
              {(['method_counts', 'method_time', 'method_location', 'method_no_people', 'method_ai'] as const).map((k) => (
                <li key={k}>{t(`public.${k}`)}</li>
              ))}
            </ul>
            <Button asChild className="min-h-11">
              <Link to="/app/report">{t('public.report')}</Link>
            </Button>
          </section>
        </PageTransition>
      </main>
    </div>
  );
}
