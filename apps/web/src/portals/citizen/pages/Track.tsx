// Guest tracking by ticket ID + PIN, no login (Spec A §5.11): the full tracker in PIN mode.
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/design/ui/button';
import { Input } from '@/design/ui/input';
import { Label } from '@/design/ui/label';
import { ErrorState, PageSkeleton, PageTransition } from '@/design/components';
import { ApiRequestError } from '@/lib/api/client';
import { api, qk } from '@/lib/api/endpoints';
import { Tracker } from '../tracker/Tracker';

export default function Track() {
  const { t, i18n } = useTranslation('citizen');
  const [params, setParams] = useSearchParams();
  const id = params.get('id') ?? '';
  const pin = params.get('pin') ?? '';
  const [ticket, setTicket] = useState(id);
  const [pinInput, setPinInput] = useState(pin);
  const q = useQuery({
    queryKey: qk.grievances.detail(id, pin),
    queryFn: ({ signal }) => api.getGrievance(id, { pin, lang: i18n.language }, signal),
    enabled: !!id && !!pin,
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setParams({ id: ticket.trim().toUpperCase(), pin: pinInput.trim() });
  };
  const notFound = q.error instanceof ApiRequestError && (q.error.status === 403 || q.error.status === 404);
  return (
    <PageTransition className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">{t('track.title')}</h1>
        <p className="text-muted-foreground">{t('track.subtitle')}</p>
      </header>
      <form
        onSubmit={submit}
        className="bg-surface grid gap-3 rounded-[var(--radius-lg)] border p-4 sm:grid-cols-[1fr_10rem_auto] sm:items-end"
      >
        <div className="space-y-1.5">
          <Label htmlFor="ticket">{t('track.ticket')}</Label>
          <Input
            id="ticket"
            required
            placeholder="GRV-2026-000123" // i18n-ignore: ticket format example
            value={ticket}
            onChange={(e) => setTicket(e.target.value)}
            className="h-11 font-mono"
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pin">{t('track.pin')}</Label>
          <Input
            id="pin"
            required
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            className="h-11 font-mono tracking-widest"
            autoComplete="one-time-code"
          />
        </div>
        <Button type="submit" className="touch-target">
          {t('track.submit')}
        </Button>
      </form>
      {id &&
        pin &&
        (q.isPending ? (
          <PageSkeleton className="p-0 md:p-0" />
        ) : q.isError ? (
          <ErrorState
            error={notFound ? undefined : q.error}
            title={notFound ? t('track.not_found') : undefined}
            onRetry={notFound ? undefined : () => q.refetch()}
          />
        ) : (
          // Ticket + PIN unlock the same tracker, with verification actions enabled (Spec A §5.11).
          <Tracker g={q.data} pin={pin} isOwner />
        ))}
    </PageTransition>
  );
}
