// Shared query hooks for reference data (cached for the session).
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Department, DepartmentId } from '@contracts/types';
import { api, qk } from './endpoints';

export function useDepartments() {
  return useQuery({ queryKey: qk.meta.departments, queryFn: ({ signal }) => api.departments(signal), staleTime: Infinity });
}

/** Map of department id → Department (undefined until loaded). */
export function useDepartmentMap(): Partial<Record<DepartmentId, Department>> {
  const { data } = useDepartments();
  return useMemo(() => Object.fromEntries((data ?? []).map((d) => [d.id, d])), [data]);
}
