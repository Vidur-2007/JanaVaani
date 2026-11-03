// On-demand translation via POST /translate, cached in memory for the session (Spec A §5.8).
import { useQuery } from '@tanstack/react-query';
import type { Lang } from '@contracts/types';
import { api } from '@/lib/api/endpoints';

export function useTranslated(text: string, target: Lang, enabled: boolean) {
  return useQuery({
    queryKey: ['jv', 'translate', target, text],
    queryFn: () => api.translate({ text, target_lang: target }),
    enabled: enabled && !!text,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
