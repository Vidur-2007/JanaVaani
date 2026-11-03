// Command palette (Spec C §3): Ctrl/Cmd+K jumps to a ticket, opens pages, runs quick filters, searches cases.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { AlarmClock, FileSearch, Hash, Siren, Timer } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/design/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/design/ui/command';
import { api, qk } from '@/lib/api/endpoints';
import { useAuth } from '@/lib/auth/useAuth';
import { navForRole } from './nav';
import { useDebounced } from '../hooks/useDebounced';
import { ticketFromInput } from '../lib/inbox';

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation('gov');
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const term = useDebounced(text.trim(), 300);
  const ticket = ticketFromInput(text);

  useEffect(() => {
    if (!open) setText('');
  }, [open]);

  const results = useQuery({
    queryKey: qk.search(term, 'gov'),
    queryFn: ({ signal }) => api.search({ q: term, scope: 'gov' }, signal),
    enabled: open && term.length >= 3 && !ticketFromInput(term),
  });

  const pages = useMemo(() => navForRole(profile?.role).flatMap((g) => g.items), [profile?.role]);
  const quick = [
    {
      id: 'critical',
      icon: Siren,
      to: '/officer?priority=critical&overdue=true',
      key: 'palette.critical_overdue',
    },
    { id: 'overdue', icon: AlarmClock, to: '/officer?overdue=true', key: 'palette.overdue' },
    { id: 'due', icon: Timer, to: '/officer?due=today', key: 'palette.due_today' },
  ];
  const go = (to: string) => {
    onOpenChange(false);
    navigate(to);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-[18%] translate-y-0 overflow-hidden p-0 sm:max-w-xl"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">{t('palette.title')}</DialogTitle>
        <DialogDescription className="sr-only">{t('palette.description')}</DialogDescription>
        <Command loop className="bg-transparent">
          <CommandInput
            value={text}
            onValueChange={setText}
            placeholder={t('palette.placeholder')}
            data-testid="palette-input"
          />
          <CommandList className="max-h-[min(24rem,60dvh)]">
            <CommandEmpty>{results.isFetching ? t('palette.searching') : t('palette.empty')}</CommandEmpty>
            {ticket && (
              <CommandGroup heading={t('palette.ticket')}>
                <CommandItem
                  forceMount
                  value={`ticket ${ticket}`}
                  onSelect={() => go(`/officer/case/${ticket}`)}
                >
                  <Hash aria-hidden />
                  <span>{t('palette.open_ticket')}</span>
                  <span className="text-muted-foreground ms-auto font-mono text-xs">{ticket}</span>
                </CommandItem>
              </CommandGroup>
            )}
            {(results.data?.grievances.length ?? 0) > 0 && (
              <CommandGroup heading={t('palette.cases')}>
                {results.data!.grievances.slice(0, 5).map((g) => (
                  <CommandItem
                    key={g.id}
                    forceMount
                    value={`case ${g.id}`}
                    onSelect={() => go(`/officer/case/${g.id}`)}
                  >
                    <FileSearch aria-hidden />
                    <span className="truncate">
                      <bdi lang="en">{g.title.en}</bdi>
                    </span>
                    <span className="text-muted-foreground ms-auto shrink-0 font-mono text-xs">{g.id}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandGroup heading={t('palette.quick_filters')}>
              {quick.map((f) => (
                <CommandItem key={f.id} value={t(f.key)} onSelect={() => go(f.to)}>
                  <f.icon aria-hidden />
                  {t(f.key)}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading={t('palette.pages')}>
              {pages.map((p) => (
                <CommandItem key={p.to} value={t(p.labelKey)} onSelect={() => go(p.to)}>
                  <p.icon aria-hidden />
                  {t(p.labelKey)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          <div
            className="text-muted-foreground flex items-center justify-between gap-2 border-t px-3 py-2 text-[11px]"
            data-testid="palette-legend"
          >
            <span>{t('palette.legend')}</span>
            {results.isFetching && <span aria-live="polite">{t('palette.searching')}</span>}
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
