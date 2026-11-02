// Notification center (Spec A §5.12): grouped by day, type icons, unread dot, mark all read, deep links to the
// tracker, community updates ("The pothole you supported is fixed"). New ones arrive via useLiveEvents (toast in the shell).
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  CircleDot,
  HandHeart,
  MessageSquare,
  ShieldQuestion,
  TrendingUp,
} from 'lucide-react';
import type { Notification } from '@contracts/types';
import { Button } from '@/design/ui/button';
import { EmptyState, ErrorState, ListSkeleton, LiveIndicator, PageTransition } from '@/design/components';
import { api, qk } from '@/lib/api/endpoints';
import { useLangFormat, TIME_ZONE } from '@/lib/i18n/useLangFormat';
import { pickLocalized } from '@/lib/localized';
import { cn } from '@/lib/utils';

const TYPE_ICON: Record<Notification['type'], { icon: typeof Bell; tone: string }> = {
  status: { icon: CircleDot, tone: 'bg-signal/12 text-signal' },
  message: { icon: MessageSquare, tone: 'bg-primary/12 text-primary' },
  escalation: { icon: TrendingUp, tone: 'bg-danger/10 text-danger' },
  community_update: { icon: HandHeart, tone: 'bg-success/12 text-success' },
  verification_request: { icon: ShieldQuestion, tone: 'bg-ai/12 text-ai' },
  alert: { icon: AlertTriangle, tone: 'bg-warning/15 text-warning' },
};

/** Day key in Asia/Kolkata so "Today" matches the citizen's day. */
const dayKey = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));

export default function Notifications() {
  const { t, i18n } = useTranslation('citizen');
  const { t: tc } = useTranslation('common');
  const fmt = useLangFormat();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: qk.notifications.list(),
    queryFn: ({ signal }) => api.notifications({ page_size: 100 }, signal),
  });
  const markAll = useMutation({
    mutationFn: () => api.markNotificationRead('all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notifications.all }),
  });
  const markOne = useMutation({
    mutationFn: (id: string) => api.markNotificationRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notifications.all }),
  });

  const groups = useMemo(() => {
    const items = [...(q.data?.items ?? [])].sort(
      (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
    );
    // "Now" = when the list was fetched (keeps render pure; the list refetches on live events anyway).
    const now = q.dataUpdatedAt;
    const today = dayKey(new Date(now).toISOString());
    const yesterday = dayKey(new Date(now - 86_400_000).toISOString());
    const map = new Map<string, Notification[]>();
    for (const n of items) map.set(dayKey(n.created_at), [...(map.get(dayKey(n.created_at)) ?? []), n]);
    return [...map.entries()].map(([k, list]) => ({
      label:
        k === today
          ? t('notifications.today')
          : k === yesterday
            ? t('notifications.yesterday')
            : fmt.date(list[0].created_at),
      list,
    }));
  }, [q.data, q.dataUpdatedAt, t, fmt]);
  const unread = q.data?.items.filter((n) => !n.read).length ?? 0;

  const open = (n: Notification) => {
    if (!n.read) markOne.mutate(n.id);
    if (n.grievance_id) navigate(`/app/complaints/${n.grievance_id}`);
  };

  return (
    <PageTransition className="max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-semibold">{tc('nav.notifications')}</h1>
          <LiveIndicator className="mt-1" />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="touch-target"
          onClick={() => markAll.mutate()}
          disabled={markAll.isPending || unread === 0}
          data-testid="mark-all-read"
        >
          <CheckCheck className="size-4" aria-hidden />
          {t('notifications.mark_all')}
        </Button>
      </div>
      {q.isPending ? (
        <ListSkeleton rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={t('notifications.empty_title')}
          description={t('notifications.empty_body')}
        />
      ) : (
        <div className="space-y-5" aria-live="polite" data-testid="notification-list">
          {groups.map((grp) => (
            <section key={grp.label} className="space-y-2">
              <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                {grp.label}
              </h2>
              <ul className="space-y-2">
                {grp.list.map((n) => {
                  const title = pickLocalized(n.title, i18n.language);
                  const body = pickLocalized(n.body, i18n.language);
                  const { icon: Icon, tone } = TYPE_ICON[n.type] ?? TYPE_ICON.status;
                  return (
                    <li key={n.id} data-testid="notification" data-read={n.read} data-type={n.type}>
                      {/* Every item is a button (keyboard reachable): tap marks it read; ones tied to a complaint deep-link to its tracker. */}
                      <button
                        type="button"
                        className={cn(
                          'bg-surface hover:border-primary/60 flex w-full items-start gap-3 rounded-[var(--radius-lg)] border p-4 text-start transition-colors',
                          !n.read && 'border-primary/40',
                        )}
                        onClick={() => open(n)}
                      >
                        <span className={cn('grid size-10 shrink-0 place-items-center rounded-full', tone)}>
                          <Icon className="size-5" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="text-muted-foreground block text-xs">
                            {t(`notifications.types.${n.type}`)}
                          </span>
                          <span className="block font-medium" lang={title.lang} dir={title.dir}>
                            {title.text}
                          </span>
                          <span
                            className="text-muted-foreground block text-sm"
                            lang={body.lang}
                            dir={body.dir}
                          >
                            {body.text}
                          </span>
                          <span className="text-muted-foreground mt-1 block text-xs">
                            {fmt.relative(n.created_at)}
                          </span>
                        </span>
                        {!n.read && (
                          <span
                            className="bg-primary mt-2 size-2.5 shrink-0 rounded-full"
                            role="img"
                            aria-label={t('notifications.unread')}
                          />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </PageTransition>
  );
}
