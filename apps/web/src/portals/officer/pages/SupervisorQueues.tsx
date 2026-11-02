// Supervisor review queues (Spec C §5.3): decisions that need a human, one tab per kind.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, PartyPopper, Timer } from 'lucide-react';
import { toast } from 'sonner';
import type { DepartmentId, Grievance } from '@contracts/types';
import { Button } from '@/design/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/design/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/design/ui/tabs';
import { Textarea } from '@/design/ui/textarea';
import {
  BeforeAfterSlider,
  DEPARTMENT_ICONS,
  EmptyState,
  ErrorState,
  ListSkeleton,
  PageTransition,
} from '@/design/components';
import { errorMessage } from '@/lib/api/client';
import { api, qk, type ReviewKind } from '@/lib/api/endpoints';
import { useLangFormat } from '@/lib/i18n/useLangFormat';
import { CaseHeader } from '@/portals/gov-shared/components/CaseHeader';
import { EmergencyDecision } from '@/portals/gov-shared/components/EmergencyDecision';
import { beforeAfter } from '@/portals/gov-shared/components/EvidenceViewer';
import { RoutingExplain } from '@/portals/gov-shared/components/RoutingExplain';
import { TranslationSplit } from '@/portals/gov-shared/components/TranslationSplit';
import { VerificationBadge } from '@/portals/gov-shared/components/VerificationBadge';

const KINDS: ReviewKind[] = ['routing', 'emergency', 'disputed', 'appeal'];
const DEPARTMENTS = Object.keys(DEPARTMENT_ICONS) as DepartmentId[];

function useQueueAction<V>(fn: (v: V) => Promise<unknown>, message: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.officer.all });
      qc.invalidateQueries({ queryKey: qk.grievances.details });
      toast.success(message);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

function Card({ g, children }: { g: Grievance; children: React.ReactNode }) {
  const { t } = useTranslation('gov');
  return (
    <article data-testid="queue-card" className="bg-surface space-y-3 rounded-[var(--radius-md)] border p-3 md:p-4">
      <div className="flex items-start justify-between gap-2">
        <CaseHeader grievance={g} asHeading={false} />
        <Link
          to={`/officer/case/${g.id}`}
          aria-label={t('queues.open_case', { id: g.id })}
          className="text-muted-foreground hover:text-text grid min-h-11 min-w-11 shrink-0 place-items-center md:min-h-8 md:min-w-8"
        >
          <ExternalLink className="size-4" aria-hidden />
        </Link>
      </div>
      {children}
    </article>
  );
}

function RoutingItem({ g }: { g: Grievance }) {
  const { t } = useTranslation('gov');
  const { t: tc } = useTranslation('common');
  const [department, setDepartment] = useState<DepartmentId>(g.routing.department);
  const decide = useQueueAction(
    () => api.routeDecision(g.id, { department_id: department }),
    t('queues.routed', { department: tc(`departments.${department}`) }),
  );
  return (
    <Card g={g}>
      <div className="grid gap-4 md:grid-cols-2">
        <TranslationSplit text={g.description} codeMixed={g.is_code_mixed} className="sm:grid-cols-1 2xl:grid-cols-1" />
        <RoutingExplain routing={g.routing} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Select value={department} onValueChange={(v) => setDepartment(v as DepartmentId)}>
          <SelectTrigger aria-label={t('filters.department')} className="min-h-11 flex-1 md:min-h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DEPARTMENTS.map((d) => (
              <SelectItem key={d} value={d}>
                {tc(`departments.${d}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          className="min-h-11 md:min-h-9"
          disabled={decide.isPending}
          onClick={() => decide.mutate(undefined)}
          data-testid="route-decide"
        >
          {t('queues.route')}
        </Button>
      </div>
    </Card>
  );
}

function SinceReport({ at }: { at: string }) {
  const { t } = useTranslation('gov');
  const fmt = useLangFormat();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <p className="text-danger tabular flex items-center gap-1.5 font-mono text-sm font-medium">
      <Timer className="size-4" aria-hidden />
      {t('queues.since_report', { time: fmt.duration((now - Date.parse(at)) / 60_000) })}
    </p>
  );
}

function EmergencyItem({ g }: { g: Grievance }) {
  return (
    <Card g={g}>
      <SinceReport at={g.created_at} />
      <TranslationSplit text={g.description} codeMixed={g.is_code_mixed} />
      <EmergencyDecision id={g.id} />
    </Card>
  );
}

function DisputedItem({ g }: { g: Grievance }) {
  const { t } = useTranslation('gov');
  const { before, after } = beforeAfter(g.media);
  const newProof = useQueueAction(
    () => api.setStatus(g.id, { status: 'in_progress', note: 'New proof demanded by supervisor' }),
    t('queues.proof_demanded'),
  );
  const close = useQueueAction(
    () => api.setStatus(g.id, { status: 'closed', note: 'Closed as disputed by supervisor' }),
    t('queues.closed_disputed'),
  );
  return (
    <Card g={g}>
      <div className="grid gap-4 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        {before && after ? (
          <BeforeAfterSlider before={before.url} after={after.url} />
        ) : (
          <TranslationSplit text={g.description} className="sm:grid-cols-1 2xl:grid-cols-1" />
        )}
        <div className="space-y-2">
          {g.ai_verification && <VerificationBadge verification={g.ai_verification} detailed />}
          {g.reopen_count > 0 && (
            <p className="text-warning text-sm">{t('inbox.flag.reopened', { count: g.reopen_count })}</p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm" className="min-h-11 flex-1 md:min-h-9">
          <Link to={`/officer/case/${g.id}`}>{t('queues.reassign')}</Link>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="min-h-11 flex-1 md:min-h-9"
          disabled={newProof.isPending}
          onClick={() => newProof.mutate(undefined)}
        >
          {t('queues.demand_proof')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="min-h-11 flex-1 md:min-h-9"
          disabled={close.isPending}
          onClick={() => close.mutate(undefined)}
        >
          {t('queues.close_disputed')}
        </Button>
      </div>
    </Card>
  );
}

function AppealItem({ g }: { g: Grievance }) {
  const { t } = useTranslation('gov');
  const [note, setNote] = useState('');
  const decide = useQueueAction(
    (decision: 'upheld' | 'dismissed') => api.appealDecision(g.id, { decision, note: note.trim() }),
    t('queues.appeal_decided'),
  );
  return (
    <Card g={g}>
      {g.appeal && <TranslationSplit text={g.appeal.reason} />}
      {g.reopen_count > 0 && (
        <p className="text-muted-foreground text-xs">{t('inbox.flag.reopened', { count: g.reopen_count })}</p>
      )}
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        aria-label={t('queues.decision_note')}
        placeholder={t('queues.decision_note')}
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          className="min-h-11 flex-1 md:min-h-9"
          disabled={!note.trim() || decide.isPending}
          onClick={() => decide.mutate('upheld')}
        >
          {t('queues.uphold')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="min-h-11 flex-1 md:min-h-9"
          disabled={!note.trim() || decide.isPending}
          onClick={() => decide.mutate('dismissed')}
        >
          {t('queues.dismiss')}
        </Button>
      </div>
    </Card>
  );
}

const ITEM: Record<ReviewKind, (p: { g: Grievance }) => React.ReactNode> = {
  routing: RoutingItem,
  emergency: EmergencyItem,
  disputed: DisputedItem,
  appeal: AppealItem,
};

export default function SupervisorQueues() {
  const { t } = useTranslation('gov');
  const [params, setParams] = useSearchParams();
  const param = params.get('kind') as ReviewKind | null;
  const kind = param && KINDS.includes(param) ? param : 'routing';
  const counts = useQueries({
    queries: KINDS.map((k) => ({
      queryKey: qk.officer.reviewQueue(k),
      queryFn: ({ signal }: { signal: AbortSignal }) => api.reviewQueue({ kind: k }, signal),
    })),
  });
  const q = useQuery({
    queryKey: qk.officer.reviewQueue(kind),
    queryFn: ({ signal }) => api.reviewQueue({ kind }, signal),
  });
  const Item = ITEM[kind];
  return (
    <PageTransition className="space-y-3">
      <h1 className="font-display text-xl font-semibold tracking-tight md:text-2xl">{t('nav.queues')}</h1>
      <Tabs value={kind} onValueChange={(v) => setParams({ kind: v }, { replace: true })}>
        <TabsList className="h-auto max-w-full justify-start overflow-x-auto">
          {KINDS.map((k, i) => (
            <TabsTrigger key={k} value={k} className="min-h-11 md:min-h-8" data-testid={`tab-${k}`}>
              {t(`queues.tab.${k}`)}
              {!!counts[i].data?.total && (
                <span className="bg-primary/15 text-primary tabular ms-1 rounded-full px-1.5 font-mono text-[11px]">
                  {counts[i].data.total}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {q.isPending ? (
        <ListSkeleton rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.items.length === 0 ? (
        <EmptyState icon={PartyPopper} title={t('queues.clear')} description={t('queues.clear_hint')} />
      ) : (
        <div className="space-y-3">
          {q.data.items.map((g) => (
            <Item key={g.id} g={g} />
          ))}
        </div>
      )}
    </PageTransition>
  );
}
