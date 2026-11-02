// P0 notification list (Spec A §5.12 — P4 completes it).
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { Button } from '@/design/ui/button';
import { EmptyState, ErrorState, ListSkeleton, PageTransition } from '@/design/components';
import { api, qk } from '@/lib/api/endpoints';
import { useLangFormat } from '@/lib/i18n/useLangFormat';
import { pickLocalized } from '@/lib/localized';
import { cn } from '@/lib/utils';

export default function Notifications() {
  const { t, i18n } = useTranslation('citizen');
  const { t: tc } = useTranslation('common');
  const fmt = useLangFormat();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: qk.notifications.list(),
    queryFn: ({ signal }) => api.notifications({}, signal),
  });
  const markAll = useMutation({
    mutationFn: () => api.markNotificationRead('all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notifications.all }),
  });
  return (
    <PageTransition className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-semibold">{tc('nav.notifications')}</h1>
        <Button
          variant="ghost"
          size="sm"
          className="touch-target"
          onClick={() => markAll.mutate()}
          disabled={markAll.isPending}
        >
          <CheckCheck className="size-4" aria-hidden />
          {t('notifications.mark_all')}
        </Button>
      </div>
      {q.isPending ? (
        <ListSkeleton rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={t('notifications.empty_title')}
          description={t('notifications.empty_body')}
        />
      ) : (
        <ul className="space-y-2" aria-live="polite">
          {q.data.items.map((n) => {
            const title = pickLocalized(n.title, i18n.language);
            const body = pickLocalized(n.body, i18n.language);
            const inner = (
              <div
                className={cn(
                  'bg-surface rounded-[var(--radius-lg)] border p-4',
                  !n.read && 'border-primary/40',
                )}
              >
                <p className="font-medium" lang={title.lang} dir={title.dir}>
                  {!n.read && (
                    <span
                      className="bg-primary me-2 inline-block size-2 rounded-full align-middle"
                      aria-hidden
                    />
                  )}
                  {title.text}
                </p>
                <p className="text-muted-foreground text-sm" lang={body.lang} dir={body.dir}>
                  {body.text}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">{fmt.relative(n.created_at)}</p>
              </div>
            );
            return (
              <li key={n.id}>
                {n.grievance_id ? <Link to={`/app/complaints/${n.grievance_id}`}>{inner}</Link> : inner}
              </li>
            );
          })}
        </ul>
      )}
    </PageTransition>
  );
}
