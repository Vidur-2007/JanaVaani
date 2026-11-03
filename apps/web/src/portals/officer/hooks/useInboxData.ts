// Turns URL filters into the inbox list. Ticket ids resolve exactly (#6), text goes to semantic search (#16),
// everything else to #28. Language, date and "due today" have no server param yet (gap G7), so they filter a
// larger SLA- or priority-ordered head of the queue on the client and paging is hidden.
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DepartmentId, Grievance, Priority, Status } from '@contracts/types';
import { api, qk, type InboxQuery } from '@/lib/api/endpoints';
import { compareInbox, isDueToday, ticketFromInput } from '@/portals/gov-shared/lib/inbox';
import type { Filters } from '@/portals/gov-shared/hooks/useUrlFilters';

export const PAGE_SIZE = 25;
const CLIENT_WINDOW = 100;
export type InboxSort = NonNullable<InboxQuery['sort']>;

// Ward ids look like W-CHM-01. #28 filters by ward id only, so a zone name is applied on the client (gap G7).
const isZone = (ward?: string) => !!ward && !ward.startsWith('W-');

function applyClientFilters(items: Grievance[], f: Filters) {
  const fromMs = f.from ? Date.parse(f.from) : null;
  const toMs = f.to ? Date.parse(f.to) + 86_400_000 : null;
  return items.filter(
    (g) =>
      (!f.lang || g.language === f.lang) &&
      (!isZone(f.ward) || g.location.zone === f.ward) &&
      (!f.due || isDueToday(g)) &&
      (fromMs == null || Date.parse(g.created_at) >= fromMs) &&
      (toMs == null || Date.parse(g.created_at) < toMs),
  );
}

export function useInboxData(filters: Filters, sort: InboxSort, page: number) {
  const text = filters.q?.trim() ?? '';
  const ticket = text ? ticketFromInput(text) : null;
  const semantic = !!text && !ticket;
  const clientOnly = !!(filters.lang || filters.from || filters.to || filters.due || isZone(filters.ward));

  const query: InboxQuery = {
    status: filters.status as Status | undefined,
    priority: filters.priority as Priority | undefined,
    category: filters.category as DepartmentId | undefined,
    ward: isZone(filters.ward) ? undefined : filters.ward,
    overdue: filters.overdue === 'true' ? true : undefined,
    sort: filters.due ? 'sla' : sort,
    page: clientOnly ? 1 : page,
    page_size: clientOnly ? CLIENT_WINDOW : PAGE_SIZE,
  };

  const inbox = useQuery({
    queryKey: qk.officer.inbox(query),
    queryFn: ({ signal }) => api.officerInbox(query, signal),
    enabled: !text,
    placeholderData: (prev) => prev,
  });
  const search = useQuery({
    queryKey: qk.search(text, 'gov'),
    queryFn: ({ signal }) => api.search({ q: text, scope: 'gov' }, signal),
    enabled: semantic,
  });
  const exact = useQuery({
    queryKey: ['jv', 'officer', 'ticket', ticket],
    queryFn: ({ signal }) => api.getGrievance(ticket!, {}, signal),
    enabled: !!ticket,
    retry: false,
  });

  const active = ticket ? exact : semantic ? search : inbox;

  const items = useMemo(() => {
    if (ticket) return exact.data ? [exact.data as Grievance] : [];
    if (semantic) return applyClientFilters(search.data?.grievances ?? [], filters);
    const list = applyClientFilters(inbox.data?.items ?? [], filters);
    return sort === 'priority' && !filters.due ? [...list].sort(compareInbox) : list;
  }, [ticket, semantic, exact.data, search.data, inbox.data, filters, sort]);

  return {
    items,
    total: text || clientOnly ? items.length : (inbox.data?.total ?? 0),
    paged: !text && !clientOnly,
    isPending: active.isPending,
    settled: !active.isPending && !inbox.isPlaceholderData,
    // A ticket that doesn't exist is an empty result, not a failure.
    isError: ticket ? false : active.isError,
    error: active.error,
    refetch: active.refetch,
    query,
  };
}
