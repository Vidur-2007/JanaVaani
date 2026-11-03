// Spec C §11 S2: root-cause graph — complaints → incident → suspected root cause. SVG with Motion, a deterministic
// radial layout (stable across live updates), keyboard-reachable complaint nodes, and a list fallback.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { List, Network } from 'lucide-react';
import type { Grievance } from '@contracts/types';
import { Button } from '@/design/ui/button';
import { useDepartmentMap } from '@/lib/api/hooks';
import { useReducedMotion } from '@/lib/prefs/store';
import { cn } from '@/lib/utils';
import { rootCauseLayout, suspectCause, type SuspectedCause } from '../lib/surge';

export function causeLabel(
  cause: SuspectedCause,
  deptName: (id: string) => string,
  t: (k: string, o?: Record<string, unknown>) => string,
) {
  const what =
    cause.basis === 'shared_asset'
      ? t('rootcause.basis.shared_asset', { id: cause.key })
      : cause.basis === 'sub_department'
        ? t('rootcause.basis.sub_department', { sub: cause.key.replace(/_/g, ' ') })
        : t('rootcause.basis.category', { dept: deptName(cause.key) });
  return cause.ward ? t('rootcause.in_ward', { what, ward: cause.ward }) : what;
}

export function RootCauseGraph({
  grievances,
  className,
  showTitle = true,
}: {
  grievances: Grievance[];
  className?: string;
  /** Hide the heading when a surrounding panel already names it. */
  showTitle?: boolean;
}) {
  const { t, i18n } = useTranslation('gov');
  const reduced = useReducedMotion();
  const navigate = useNavigate();
  const depts = useDepartmentMap();
  const [asList, setAsList] = useState(false);
  const cause = suspectCause(grievances);
  if (!cause) return null;
  const deptName = (id: string) => depts[id as keyof typeof depts]?.name.en ?? id;
  const label = causeLabel(cause, deptName, t);
  const size = 520;
  const { nodes, edges, hidden } = rootCauseLayout(grievances, size);
  const pos = new Map(nodes.map((n) => [n.id, n]));
  const pct = new Intl.NumberFormat(i18n.language === 'en' ? 'en-IN' : i18n.language, {
    style: 'percent',
  }).format(cause.share);

  return (
    <section
      className={cn('space-y-3', className)}
      aria-labelledby="rootcause-title"
      data-testid="root-cause-graph"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3
            id="rootcause-title"
            className={cn('font-display text-base font-semibold', !showTitle && 'sr-only')}
          >
            {t('rootcause.title')}
          </h3>
          <p className="text-muted-foreground text-sm">
            <span className="text-text font-medium" data-testid="root-cause-label">
              {label}
            </span>{' '}
            · {t('rootcause.support', { count: cause.support, pct })}
          </p>
          <p className="text-muted-foreground text-xs">{t('rootcause.rule_note')}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="min-h-11 md:min-h-8"
          onClick={() => setAsList((v) => !v)}
          aria-pressed={asList}
        >
          {asList ? <Network className="size-4" aria-hidden /> : <List className="size-4" aria-hidden />}
          {asList ? t('rootcause.show_graph') : t('rootcause.show_list')}
        </Button>
      </div>

      {asList ? (
        <ul className="divide-y rounded-[var(--radius-md)] border text-sm" data-testid="root-cause-list">
          {grievances.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <Link
                to={`/officer/case/${g.id}`}
                className="text-primary tabular font-mono text-xs underline-offset-2 hover:underline"
              >
                {g.id}
              </Link>
              <span className="min-w-0 flex-1 truncate">
                <bdi lang="en">{g.title.en}</bdi>
              </span>
              <span className="text-muted-foreground text-xs">
                {g.incident_id ?? t('rootcause.no_incident')}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="bg-surface-2 relative overflow-hidden rounded-[var(--radius-lg)] border">
          <svg
            viewBox={`0 0 ${size} ${size}`}
            className="mx-auto block aspect-square w-full max-w-[520px]"
            role="group"
            aria-label={t('rootcause.aria', { label, count: grievances.length })}
          >
            {edges.map((e, i) => {
              const a = pos.get(e.from)!;
              const b = pos.get(e.to)!;
              return (
                <motion.line
                  key={`${e.from}-${e.to}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="var(--border)"
                  strokeWidth={e.from === 'cause' ? 2 : 1}
                  initial={reduced ? false : { pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 0.5, delay: Math.min(i * 0.012, 0.6) }}
                />
              );
            })}
            {nodes.map((n, i) => {
              if (n.kind === 'cause')
                return (
                  <g key={n.id}>
                    <motion.circle
                      cx={n.x}
                      cy={n.y}
                      r={30}
                      fill="color-mix(in oklab, var(--danger) 22%, var(--surface))"
                      stroke="var(--danger)"
                      strokeWidth={2.5}
                      initial={reduced ? false : { scale: 0 }}
                      animate={{ scale: 1 }}
                      style={{ transformOrigin: `${n.x}px ${n.y}px` }}
                    />
                    <text
                      x={n.x}
                      y={n.y + 4}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight="700"
                      fill="var(--danger)"
                    >
                      {t('rootcause.cause_short')}
                    </text>
                  </g>
                );
              if (n.kind === 'incident')
                return (
                  <g key={n.id}>
                    <circle
                      cx={n.x}
                      cy={n.y}
                      r={16 + Math.min(10, n.count ?? 0)}
                      fill="color-mix(in oklab, var(--accent) 18%, var(--surface))"
                      stroke="var(--accent)"
                      strokeWidth={2}
                    />
                    <text
                      x={n.x}
                      y={n.y + 4}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight="700"
                      fill="var(--accent)"
                      className="tabular"
                    >
                      {n.count}
                    </text>
                    <title>{t('rootcause.incident_node', { id: n.id.slice(4), count: n.count })}</title>
                  </g>
                );
              const g = n.grievance!;
              return (
                <a
                  key={n.id}
                  href={`/officer/case/${g.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(`/officer/case/${g.id}`);
                  }}
                  aria-label={`${g.id}: ${g.title.en}`}
                  data-testid="root-cause-node"
                >
                  <motion.circle
                    cx={n.x}
                    cy={n.y}
                    r={7}
                    fill={`var(--prio-${g.priority})`}
                    stroke="var(--surface)"
                    strokeWidth={1.5}
                    initial={reduced ? false : { opacity: 0, scale: 0.4 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2 + Math.min(i * 0.015, 0.7) }}
                    style={{ transformOrigin: `${n.x}px ${n.y}px` }}
                  />
                  <title>{`${g.id} · ${g.title.en}`}</title>
                </a>
              );
            })}
          </svg>
          <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 border-t px-3 py-2 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <span className="border-danger size-3 rounded-full border-2" aria-hidden />{' '}
              {t('rootcause.legend_cause')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="border-accent size-3 rounded-full border-2" aria-hidden />{' '}
              {t('rootcause.legend_incident')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="bg-prio-high size-2.5 rounded-full" aria-hidden />{' '}
              {t('rootcause.legend_complaint')}
            </span>
            {hidden > 0 && <span>{t('rootcause.hidden', { count: hidden })}</span>}
          </div>
        </div>
      )}
    </section>
  );
}
