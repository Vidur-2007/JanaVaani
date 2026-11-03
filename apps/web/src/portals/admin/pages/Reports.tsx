// Report builder (Spec C §6.9): pick a period and sections, preview, export.
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Checkbox } from '@/design/ui/checkbox';
import { Label } from '@/design/ui/label';
import { ErrorState, PageTransition, TextSkeleton } from '@/design/components';
import { api, qk } from '@/lib/api/endpoints';
import { DaysSelector, useDays } from '@/portals/gov-shared/components/DaysSelector';
import { ExportMenu } from '@/portals/gov-shared/components/ExportMenu';
import { Panel } from '@/portals/gov-shared/components/Panel';
import type { ExportSheet } from '@/portals/gov-shared/lib/export';

const SECTIONS = ['kpis', 'departments', 'issues', 'alerts'] as const;
type Section = (typeof SECTIONS)[number];

function SheetTable({ sheet }: { sheet: ExportSheet }) {
  return (
    <section className="space-y-1" data-testid="report-section">
      <h2 className="font-display text-sm font-semibold">{sheet.name}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {sheet.columns.map((c) => (
                <th key={c} scope="col" className="text-muted-foreground border-b px-2 py-1 text-start text-xs font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((r, i) => (
              <tr key={i}>
                {r.map((v, j) => (
                  <td key={j} className="tabular border-b px-2 py-1">
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function Reports() {
  const { t } = useTranslation('gov');
  const { t: tc } = useTranslation('common');
  const days = useDays();
  const [picked, setPicked] = useState<Record<Section, boolean>>({ kpis: true, departments: true, issues: true, alerts: true });
  const preview = useRef<HTMLDivElement>(null);
  const kpis = useQuery({ queryKey: qk.admin.kpis(days), queryFn: ({ signal }) => api.adminKpis({ days }, signal) });
  const perf = useQuery({ queryKey: qk.admin.performance(days), queryFn: ({ signal }) => api.departmentPerformance({ days }, signal) });
  const issues = useQuery({ queryKey: qk.admin.breakdown({ by: 'category', days }), queryFn: ({ signal }) => api.breakdown({ by: 'category', days }, signal) });
  const alerts = useQuery({ queryKey: qk.admin.alerts, queryFn: ({ signal }) => api.alerts(signal) });
  const failed = [kpis, perf, issues, alerts].find((q) => q.isError);
  const loading = [kpis, perf, issues, alerts].some((q) => q.isPending);

  const sheets = useMemo<ExportSheet[]>(() => {
    if (!kpis.data || !perf.data || !issues.data || !alerts.data) return [];
    const k = kpis.data;
    const all: Record<Section, ExportSheet> = {
      kpis: {
        name: t('reports.section.kpis'),
        columns: [t('reports.metric'), t('admin.value')],
        rows: [
          [t('kpi.total'), k.total],
          [t('kpi.open'), k.open],
          [t('kpi.resolved'), k.resolved],
          [t('kpi.overdue'), k.overdue],
          [t('kpi.sla'), k.sla_compliance_pct],
          [t('kpi.avg_resolution'), k.avg_resolution_hours],
          [t('kpi.satisfaction'), k.satisfaction_avg],
        ],
      },
      departments: {
        name: t('reports.section.departments'),
        columns: ['#', t('inbox.column.department'), t('departments.score'), t('departments.sla'), t('kpi.open'), t('kpi.overdue')],
        rows: [...perf.data]
          .sort((a, b) => a.rank - b.rank)
          .map((d) => [d.rank, tc(`departments.${d.department_id}`), d.score, d.sla_compliance_pct, d.open, d.overdue]),
      },
      issues: {
        name: t('reports.section.issues'),
        columns: [t('reports.issue'), t('kpi.total'), t('kpi.open'), t('kpi.overdue')],
        rows: [...issues.data].sort((a, b) => b.total - a.total).slice(0, 10).map((r) => [r.label, r.total, r.open, r.overdue]),
      },
      alerts: {
        name: t('reports.section.alerts'),
        columns: [t('reports.severity'), t('reports.alert')],
        rows: alerts.data.map((a) => [t(`alerts.level.${a.severity}`), a.title_en]),
      },
    };
    return SECTIONS.filter((s) => picked[s]).map((s) => all[s]);
  }, [kpis.data, perf.data, issues.data, alerts.data, picked, t, tc]);

  const title = t('reports.title', { count: days });
  return (
    <PageTransition className="space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-xl font-semibold tracking-tight md:text-2xl">{t('nav.reports')}</h1>
        <div className="flex items-center gap-2">
          <DaysSelector />
          <ExportMenu sheets={sheets} filename={`janavaani-report-${days}d`} title={title} target={preview} disabled={sheets.length === 0} />
        </div>
      </header>
      <Panel title={t('reports.sections')}>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {SECTIONS.map((s) => (
            <div key={s} className="flex min-h-11 items-center gap-2 md:min-h-8">
              <Checkbox
                id={`section-${s}`}
                checked={picked[s]}
                onCheckedChange={(v) => setPicked((p) => ({ ...p, [s]: !!v }))}
              />
              <Label htmlFor={`section-${s}`}>{t(`reports.section.${s}`)}</Label>
            </div>
          ))}
        </div>
      </Panel>
      {failed ? (
        <ErrorState error={failed.error} onRetry={() => failed.refetch()} />
      ) : loading ? (
        <TextSkeleton lines={6} />
      ) : (
        <div ref={preview} className="bg-surface space-y-4 rounded-[var(--radius-md)] border p-4">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          {sheets.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('reports.none')}</p>
          ) : (
            sheets.map((s) => <SheetTable key={s.name} sheet={s} />)
          )}
        </div>
      )}
    </PageTransition>
  );
}
