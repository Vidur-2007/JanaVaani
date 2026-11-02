// Filters live in the URL so every view is shareable (Spec C §4).
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

export const FILTER_KEYS = [
  'category',
  'priority',
  'status',
  'ward',
  'lang',
  'from',
  'to',
  'overdue',
  'due',
  'q',
] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];
export type Filters = Partial<Record<FilterKey, string>>;

export function useUrlFilters() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => {
    const out: Filters = {};
    for (const k of FILTER_KEYS) {
      const v = params.get(k);
      if (v) out[k] = v;
    }
    return out;
  }, [params]);

  /** Merge changes; an empty value clears the key. Any filter change returns to page 1. */
  const setFilters = useCallback(
    (patch: Filters) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v) next.set(k, v);
            else next.delete(k);
          }
          next.delete('page');
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  const clear = useCallback(
    () =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          FILTER_KEYS.forEach((k) => next.delete(k));
          next.delete('page');
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  return { filters, setFilters, clear, activeCount: Object.keys(filters).length };
}
