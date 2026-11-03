// Audit (Spec C §6.7). #51 filters by ticket and type only (gap G9), so actor and date filter the fetched page.
// #52 with no ticket checks every chain, which is stronger than the sample the spec asks for.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, CircleHelp, ScrollText, ShieldCheck, ShieldX } from 'lucide-react';
import type { TimelineEvent, TimelineEventType } from '@contracts/types';
import { Button } from '@/design/ui/button';
import { Input } from '@/design/ui/input';
import { Label } from '@/design/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/design/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/design/ui/select';
import { EmptyState, ErrorState, ListSkeleton, PageTransition, TextSkeleton } from '@/design/components';
import { errorMessage } from '@/lib/api/client';
import { api, qk } from '@/lib/api/endpoints';
import { useLangFormat } from '@/lib/i18n/useLangFormat';
import { AuditChain, orderChain } from '@/portals/gov-shared/components/AuditChain';
import { DataTable, type DataColumn } from '@/portals/gov-shared/components/DataTable';
import { ExportMenu } from '@/portals/gov-shared/components/ExportMenu';
import { Panel } from '@/portals/gov-shared/components/Panel';
import { useDebounced } from '@/portals/gov-shared/hooks/useDebounced';

const TYPES: TimelineEventType[] = [
  'escalated',
  'reassigned',
  'status_changed',
  'closed',
  'emergency_confirmed',
  'resolution_submitted',
  'ai_verification',
  'appeal_decided',
];
const ALL = '__all__';
const rowId = (e: TimelineEvent) => e.id;

function HowItWorks() {
  const { t } = useTranslation('gov');
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="min-h-11 md:min-h-9">
          <CircleHelp className="size-4" aria-hidden />
          {t('audit.how_label')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 text-sm">
        <p className="text-muted-foreground">{t('audit.how_body')}</p>
      </PopoverContent>
    </Popover>
  );
}

function CaseChain({ id }: { id: string }) {
  const { t } = useTranslation('gov');
  const q = useQuery({
    queryKey: qk.admin.audit({ grievance_id: id }),
    queryFn: ({ signal }) => api.audit({ grievance_id: id }, signal),
  });
  const events = useMemo(() => orderChain(q.data?.items ?? []), [q.data]);
  return (
    <Panel title={t('audit.chain_title', { id })}>
      {q.isPending ? (
        <TextSkeleton lines={3} />
      ) : q.isError ? (
        <ErrorState compact error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <AuditChain blocks grievanceId={id} events={events} />
      )}
    </Panel>
  );
}

export default function Audit() {
  const { t } = useTranslation('gov');
  const { t: tc } = useTranslation('common');
  const fmt = useLangFormat();
  const [ticket, setTicket] = useState('');
  const [type, setType] = useState(ALL);
  const [actor, setActor] = useState('');
  const [date, setDate] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const grievance_id = useDebounced(ticket.trim().toUpperCase(), 350);
  const exportTarget = useRef<HTMLDivElement>(null);
  const query = {
    grievance_id: grievance_id || undefined,
    type: type === ALL ? undefined : (type as TimelineEventType),
    page,
  };
  useEffect(() => setPage(1), [grievance_id, type]);
  const q = useQuery({
    queryKey: qk.admin.audit(query),
    queryFn: ({ signal }) => api.audit(query, signal),
    placeholderData: (prev) => prev,
  });
  const verifyAll = useMutation({ mutationFn: () => api.auditVerify() });
  const items = useMemo(() => {
    const who = actor.trim().toLowerCase();
    return (q.data?.items ?? []).filter(
      (e) =>
        (!who || `${e.actor_name ?? ''} ${e.actor_role}`.toLowerCase().includes(who)) &&
        (!date || e.created_at.startsWith(date)),
    );
  }, [q.data, actor, date]);
  const columns = useMemo<DataColumn<TimelineEvent>[]>(
    () => [
      {
        id: 'when',
        title: t('audit.when'),
        header: t('audit.when'),
        cell: ({ row }) => <span className="text-xs whitespace-nowrap">{fmt.dateTime(row.original.created_at)}</span>,
      },
      {
        id: 'ticket',
        header: t('audit.ticket'),
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.grievance_id}</span>,
      },
      {
        id: 'type',
        title: t('audit.type'),
        header: t('audit.type'),
        cell: ({ row }) => tc(`timeline.types.${row.original.type}`, { defaultValue: row.original.type }),
      },
      {
        id: 'actor',
        title: t('audit.actor'),
        header: t('audit.actor'),
        cell: ({ row }) => row.original.actor_name ?? row.original.actor_role,
      },
      {
        id: 'hash',
        title: t('audit.hash'),
        header: t('audit.hash'),
        cell: ({ row }) => (
          <span className="tabular font-mono text-xs" title={row.original.hash}>
            {row.original.hash.slice(0, 8)}
          </span>
        ),
      },
    ],
    [t, tc, fmt],
  );
  const sheets = [
    {
      name: t('nav.audit'),
      columns: [t('audit.when'), t('audit.ticket'), t('audit.type'), t('audit.actor'), t('audit.hash')],
      rows: items.map((e) => [e.created_at, e.grievance_id, e.type, e.actor_name ?? e.actor_role, e.hash]),
    },
  ];
  const lastPage = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.page_size)) : 1;
  const v = verifyAll.data;
  return (
    <PageTransition className="space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-xl font-semibold tracking-tight md:text-2xl">{t('nav.audit')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <HowItWorks />
          <ExportMenu sheets={sheets} filename="audit-events" title={t('nav.audit')} target={exportTarget} disabled={!items.length} />
          <Button
            size="sm"
            className="min-h-11 md:min-h-9"
            disabled={verifyAll.isPending}
            onClick={() => verifyAll.mutate()}
            data-testid="verify-all"
          >
            <ShieldCheck className="size-4" aria-hidden />
            {verifyAll.isPending ? t('audit.verifying') : t('audit.verify_all')}
          </Button>
        </div>
      </header>
      <p className="text-sm" aria-live="polite" data-testid="verify-all-result">
        {verifyAll.isError && <span className="text-danger">{errorMessage(verifyAll.error)}</span>}
        {v?.valid && (
          <span className="text-success inline-flex items-center gap-1 font-medium">
            <ShieldCheck className="size-4" aria-hidden />
            {t('audit.valid', { count: v.events_checked })}
          </span>
        )}
        {v && !v.valid && (
          <span className="text-danger inline-flex items-center gap-1 font-medium">
            <ShieldX className="size-4" aria-hidden />
            {t('audit.broken')}
          </span>
        )}
      </p>
      <section aria-label={t('filters.label')} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="audit-ticket" className="text-xs">{t('audit.ticket')}</Label>
          <Input id="audit-ticket" value={ticket} onChange={(e) => setTicket(e.target.value)} placeholder="GRV-2026-000101" className="min-h-11 md:min-h-9" data-testid="audit-ticket" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t('audit.type')}</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger aria-label={t('audit.type')} className="min-h-11 w-full md:min-h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('filters.all')}</SelectItem>
              {TYPES.map((ty) => (
                <SelectItem key={ty} value={ty}>
                  {tc(`timeline.types.${ty}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="audit-actor" className="text-xs">{t('audit.actor')}</Label>
          <Input id="audit-actor" value={actor} onChange={(e) => setActor(e.target.value)} className="min-h-11 md:min-h-9" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="audit-date" className="text-xs">{t('audit.date')}</Label>
          <Input id="audit-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="min-h-11 md:min-h-9" />
        </div>
      </section>
      {selected && <CaseChain key={selected} id={selected} />}
      {q.isPending ? (
        <ListSkeleton rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={ScrollText} title={t('audit.empty')} />
      ) : (
        <div ref={exportTarget} className="space-y-2">
          <DataTable
            data={items}
            columns={columns}
            getRowId={rowId}
            label={t('nav.audit')}
            maxHeight="min(60dvh, 560px)"
            onRowOpen={(e) => setSelected(e.grievance_id)}
            renderCard={(e) => (
              <button
                type="button"
                data-testid="audit-card"
                onClick={() => setSelected(e.grievance_id)}
                className="bg-surface block w-full space-y-0.5 rounded-[var(--radius-md)] border p-3 text-start"
              >
                <span className="block text-sm font-medium">{tc(`timeline.types.${e.type}`, { defaultValue: e.type })}</span>
                <span className="text-muted-foreground block font-mono text-xs">{e.grievance_id}</span>
                <span className="text-muted-foreground block text-xs">{fmt.dateTime(e.created_at)}</span>
              </button>
            )}
          />
          {lastPage > 1 && (
            <nav aria-label={t('table.pagination')} className="flex items-center justify-end gap-2">
              <Button variant="outline" size="icon" className="min-h-11 min-w-11 md:min-h-9 md:min-w-9" disabled={page <= 1} aria-label={t('table.previous')} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="rtl-flip size-4" aria-hidden />
              </Button>
              <span className="tabular text-sm">{t('table.page', { page, total: lastPage })}</span>
              <Button variant="outline" size="icon" className="min-h-11 min-w-11 md:min-h-9 md:min-w-9" disabled={page >= lastPage} aria-label={t('table.next')} onClick={() => setPage(page + 1)}>
                <ChevronRight className="rtl-flip size-4" aria-hidden />
              </Button>
            </nav>
          )}
        </div>
      )}
    </PageTransition>
  );
}
