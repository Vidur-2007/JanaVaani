// Gov notifications (Spec C §3): #18/#19, refreshed by live events, with a toast for escalations and alerts.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import type { Notification } from '@contracts/types';
import { Button } from '@/design/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/design/ui/popover';
import { ScrollArea } from '@/design/ui/scroll-area';
import { EmptyState, ErrorState, TextSkeleton } from '@/design/components';
import { api, qk } from '@/lib/api/endpoints';
import { useLangFormat } from '@/lib/i18n/useLangFormat';
import { useLiveEvent } from '@/lib/live/useLiveEvents';
import { pickLocalized } from '@/lib/localized';
import { cn } from '@/lib/utils';

export function NotificationsBell() {
  const { t, i18n } = useTranslation('gov');
  const fmt = useLangFormat();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: qk.notifications.list(),
    queryFn: ({ signal }) => api.notifications({ page_size: 30 }, signal),
  });
  const read = useMutation({
    mutationFn: (id: string) => api.markNotificationRead(id),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.notifications.all }),
  });

  useLiveEvent((e) => {
    if (e.kind === 'alert') toast.warning(t('notifications.new_alert'));
    if (e.kind === 'notification') toast(t('notifications.new'));
  });

  const items = q.data?.items ?? [];
  const unread = items.filter((n) => !n.read).length;
  const openItem = (n: Notification) => {
    if (!n.read) read.mutate(n.id);
    setOpen(false);
    if (n.grievance_id) navigate(`/officer/case/${n.grievance_id}`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="touch-target relative"
          aria-label={t('notifications.label', { count: unread })}
        >
          <Bell className="size-5" aria-hidden />
          {unread > 0 && (
            <span className="bg-primary text-primary-foreground tabular absolute end-1 top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 font-mono text-[10px] font-semibold">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <p className="font-display text-sm font-semibold">{t('notifications.title')}</p>
          <Button
            variant="ghost"
            size="sm"
            disabled={unread === 0}
            onClick={() => read.mutate('all')}
            className="min-h-11 min-w-11 md:min-h-8 md:min-w-0"
          >
            <CheckCheck className="size-4" aria-hidden />
            {t('notifications.mark_all')}
          </Button>
        </div>
        {q.isPending ? (
          <TextSkeleton lines={4} className="p-4" />
        ) : q.isError ? (
          <ErrorState compact error={q.error} onRetry={() => q.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState icon={BellOff} title={t('notifications.empty')} className="py-8" />
        ) : (
          <ScrollArea className="max-h-96">
            <ul className="divide-y">
              {items.map((n) => {
                const title = pickLocalized(n.title, i18n.language);
                const body = pickLocalized(n.body, i18n.language);
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openItem(n)}
                      className="hover:bg-surface-2 flex min-h-11 w-full gap-2.5 px-3 py-2.5 text-start transition-colors"
                    >
                      <span
                        className={cn(
                          'mt-1.5 size-2 shrink-0 rounded-full',
                          n.read ? 'bg-transparent' : 'bg-primary',
                        )}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium" lang={title.lang} dir={title.dir}>
                          {title.text}
                        </span>
                        <span
                          className="text-muted-foreground line-clamp-2 block text-xs"
                          lang={body.lang}
                          dir={body.dir}
                        >
                          {body.text}
                        </span>
                        <time className="text-muted-foreground text-[11px]" dateTime={n.created_at}>
                          {fmt.relative(n.created_at)}
                        </time>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
