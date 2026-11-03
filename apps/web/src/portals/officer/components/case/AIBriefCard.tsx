// AI brief (Spec C §5.2). Keyed outside qk.officer so live events don't re-run the LLM; only Refresh does.
import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircleQuestion, RefreshCw } from 'lucide-react';
import { Button } from '@/design/ui/button';
import { Checkbox } from '@/design/ui/checkbox';
import { AIBadge, ErrorState, TextSkeleton } from '@/design/components';
import { api } from '@/lib/api/endpoints';
import { Panel } from '@/portals/gov-shared/components/Panel';

const briefKey = (id: string) => ['jv-brief', id] as const;

function Section({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="text-muted-foreground mb-0.5 text-xs font-medium">{title}</h3>
      <ul className="list-disc space-y-0.5 ps-4 text-sm">
        {items.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </div>
  );
}

export function AIBriefCard({ id }: { id: string }) {
  const { t } = useTranslation('gov');
  const qc = useQueryClient();
  const [done, setDone] = useState<Record<string, boolean>>({});
  const q = useQuery({
    queryKey: briefKey(id),
    queryFn: () => api.officerBrief(id),
    staleTime: Infinity,
  });
  const refresh = useMutation({
    mutationFn: () => api.officerBrief(id, { refresh: true }),
    onSuccess: (b) => qc.setQueryData(briefKey(id), b),
  });
  return (
    <Panel
      ai
      title={t('brief.title')}
      action={
        <span className="flex items-center gap-1">
          <AIBadge variant="generated" />
          <Button
            variant="ghost"
            size="icon-sm"
            className="min-h-11 min-w-11 md:min-h-8 md:min-w-8"
            aria-label={t('brief.refresh')}
            disabled={refresh.isPending}
            onClick={() => refresh.mutate()}
          >
            <RefreshCw className="size-4" aria-hidden />
          </Button>
        </span>
      }
    >
      {q.isPending ? (
        <TextSkeleton lines={4} />
      ) : q.isError ? (
        <ErrorState compact error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <div className="space-y-3" data-testid="ai-brief">
          <p className="text-sm">{q.data.situation}</p>
          <Section title={t('brief.evidence')} items={q.data.evidence} />
          <Section title={t('brief.risks')} items={q.data.risks} />
          {q.data.suggested_next_steps.length > 0 && (
            <div>
              <h3 className="text-muted-foreground mb-1 text-xs font-medium">{t('brief.next_steps')}</h3>
              <ul>
                {q.data.suggested_next_steps.map((s) => (
                  <li key={s}>
                    <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={!!done[s]}
                        onCheckedChange={(v) => setDone((d) => ({ ...d, [s]: !!v }))}
                      />
                      <span className={done[s] ? 'text-muted-foreground line-through' : undefined}>{s}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {q.data.missing_info.map((m) => (
            <p key={m} className="text-warning flex items-start gap-1.5 text-sm">
              <MessageCircleQuestion className="mt-0.5 size-4 shrink-0" aria-hidden />
              {m}
            </p>
          ))}
          {q.data.similar_resolved.length > 0 && (
            <div>
              <h3 className="text-muted-foreground mb-1 text-xs font-medium">{t('brief.similar')}</h3>
              <ul className="space-y-1">
                {q.data.similar_resolved.map((s) => (
                  <li key={s.grievance_id} className="text-sm">
                    <Link to={`/officer/case/${s.grievance_id}`} className="hover:text-primary font-medium">
                      {s.title_en}
                    </Link>
                    <span className="text-muted-foreground block text-xs">{s.resolution_note}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
