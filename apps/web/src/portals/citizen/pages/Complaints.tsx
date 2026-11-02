// My complaints (Spec A §5.8): filter chips (All · Open · Needs my action · Closed) and a cross-language search box
// (/search?scope=mine — a Telugu query finds an English complaint).
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { FileText, Plus, Search, X } from 'lucide-react';
import type { Status } from '@contracts/types';
import { Button } from '@/design/ui/button';
import { Input } from '@/design/ui/input';
import { EmptyState, ErrorState, ListSkeleton, PageTransition } from '@/design/components';
import { api, qk } from '@/lib/api/endpoints';
import { cn } from '@/lib/utils';
import { GrievanceCard } from '../components/GrievanceCard';

type Filter = 'all' | 'open' | 'action' | 'closed';
const FILTER_STATUS: Record<Filter, Status[] | undefined> = {
  all: undefined,
  open: ['registered', 'needs_review', 'assigned', 'in_progress', 'reopened'],
  action: ['resolved_pending_verification'],
  closed: ['closed', 'rejected', 'merged'],
};

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

export default function Complaints() {
  const { t, i18n } = useTranslation('citizen');
  const [params, setParams] = useSearchParams();
  const filter = (params.get('filter') as Filter) || 'all';
  const [query, setQuery] = useState(params.get('q') ?? '');
  const q = useDebounced(query.trim(), 350);

  const list = useQuery({
    queryKey: qk.grievances.mine({ status: FILTER_STATUS[filter] }),
    queryFn: ({ signal }) => api.myGrievances({ status: FILTER_STATUS[filter], page_size: 50 }, signal),
    enabled: !q,
  });
  const search = useQuery({
    queryKey: qk.search(q, 'mine'),
    queryFn: ({ signal }) => api.search({ q, scope: 'mine', lang: i18n.language }, signal),
    enabled: !!q,
  });
  // Search results honour the active filter too.
  const allowed = FILTER_STATUS[filter];
  const active = q ? search : list;
  const items = q ? (search.data?.grievances ?? []).filter((g) => !allowed || allowed.includes(g.status)) : (list.data?.items ?? []);

  const setFilter = (f: Filter) => {
    const next = new URLSearchParams(params);
    if (f === 'all') next.delete('filter');
    else next.set('filter', f);
    setParams(next, { replace: true });
  };

  return (
    <PageTransition className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-semibold">{t('complaints.title')}</h1>
        <Button asChild size="sm" className="touch-target">
          <Link to="/app/report">
            <Plus className="size-4" aria-hidden />
            {t('complaints.new')}
          </Link>
        </Button>
      </div>

      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2" aria-hidden />
        <label htmlFor="complaint-search" className="sr-only">
          {t('complaints.search')}
        </label>
        <Input
          id="complaint-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('complaints.search_placeholder')}
          className="h-12 ps-10 pe-10 text-base"
          dir="auto"
          data-testid="complaint-search"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} className="text-muted-foreground absolute end-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center" aria-label={t('complaints.clear_search')}>
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label={t('complaints.filters')}>
        {(['all', 'open', 'action', 'closed'] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={cn('jv-press touch-target shrink-0 rounded-full border px-4 text-sm font-medium transition-colors', filter === f ? 'border-primary bg-primary text-primary-foreground' : 'bg-surface hover:bg-surface-2')}
            data-testid={`filter-${f}`}
          >
            {t(`complaints.filter.${f}`)}
          </button>
        ))}
      </div>

      {q && search.data && <p className="text-muted-foreground text-sm" aria-live="polite">{t('complaints.results', { count: items.length, q })}</p>}

      {active.isPending ? (
        <ListSkeleton />
      ) : active.isError ? (
        <ErrorState error={active.error} onRetry={() => active.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={q ? Search : FileText}
          title={q ? t('complaints.no_results', { q }) : filter === 'all' ? t('home.empty_title') : t('complaints.empty_filter')}
          description={q ? t('complaints.no_results_hint') : filter === 'all' ? t('home.empty_body') : undefined}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2" data-testid="complaint-list">
          {items.map((g) => (
            <GrievanceCard key={g.id} g={g} />
          ))}
        </div>
      )}
    </PageTransition>
  );
}
