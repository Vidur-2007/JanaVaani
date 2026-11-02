// Personal stats derived from the officer's own finished cases. No stats endpoint exists (contract gap G1).
import type { Grievance } from '@contracts/types';

const DAY = 86_400_000;
const metSla = (g: Grievance) => !!g.resolved_at && Date.parse(g.resolved_at) <= Date.parse(g.sla.due_at);

export interface OfficerStats {
  resolved_7d: number;
  avg_resolution_hours: number;
  sla_pct: number;
  avg_rating: number | null;
  /** Consecutive most recent resolutions inside SLA. */
  streak: number;
  trend: { date: string; resolved: number }[];
}

export function computeOfficerStats(cases: Grievance[], now = Date.now(), days = 14): OfficerStats {
  const done = cases
    .filter((g) => g.resolved_at)
    .sort((a, b) => Date.parse(b.resolved_at!) - Date.parse(a.resolved_at!));
  const hours = done.map((g) => (Date.parse(g.resolved_at!) - Date.parse(g.created_at)) / 3_600_000);
  const ratings = done.flatMap((g) => (g.rating ? [g.rating] : []));
  const firstMiss = done.findIndex((g) => !metSla(g));
  const trend = Array.from({ length: days }, (_, i) => {
    const date = new Date(now - (days - 1 - i) * DAY).toISOString().slice(0, 10);
    return { date, resolved: done.filter((g) => g.resolved_at!.slice(0, 10) === date).length };
  });
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return {
    resolved_7d: done.filter((g) => now - Date.parse(g.resolved_at!) <= 7 * DAY).length,
    avg_resolution_hours: done.length ? +mean(hours).toFixed(1) : 0,
    sla_pct: done.length ? +((done.filter(metSla).length / done.length) * 100).toFixed(1) : 0,
    avg_rating: ratings.length ? +mean(ratings).toFixed(1) : null,
    streak: firstMiss === -1 ? done.length : firstMiss,
    trend,
  };
}
