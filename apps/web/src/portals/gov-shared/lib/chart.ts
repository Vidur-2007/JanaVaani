// Shared Recharts styling (Spec C §8): one axis and tooltip look, entrance capped at 600 ms.
import type { CSSProperties } from 'react';
import type { DepartmentId } from '@contracts/types';

export const axisTick = { fontSize: 11, fill: 'var(--text-muted)' };
export const tooltipStyle: CSSProperties = {
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text)',
  fontSize: 12,
};
export const CHART_ANIMATION_MS = 600;
/** Head start the first chart of a pair gets. Total stays within the 600 ms budget of §8 plus this beat. */
export const CHART_FOLLOW_MS = 120;
export const deptColor = (d: DepartmentId) => `var(--dept-${d})`;

export const median = (xs: number[]) => {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
