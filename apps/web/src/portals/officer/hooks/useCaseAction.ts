// Case mutations: a returned GrievanceDetail goes straight into the cache, lists refresh behind it.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { GrievanceDetail } from '@contracts/types';
import { errorMessage } from '@/lib/api/client';
import { qk } from '@/lib/api/endpoints';

const isDetail = (v: unknown): v is GrievanceDetail =>
  typeof v === 'object' && v !== null && 'timeline' in v;

export function useCaseAction<V, R>(
  id: string,
  fn: (vars: V) => Promise<R>,
  onDone?: (result: R) => void,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result) => {
      if (isDetail(result)) qc.setQueryData(qk.grievances.detail(id), result);
      else qc.invalidateQueries({ queryKey: qk.grievances.detail(id) });
      qc.invalidateQueries({ queryKey: qk.officer.all });
      onDone?.(result);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}
