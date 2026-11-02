// Submitted (Spec A §5.4): animated ticket ID, guest PIN (copy + "save this PIN"), SLA due date,
// Download receipt · Track now · Report another.
import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { CalendarClock, Check, CheckCircle2, Copy, Download, Plus, Search, TriangleAlert } from 'lucide-react';
import { Button } from '@/design/ui/button';
import { Confetti, DepartmentBadge, ErrorState, PriorityChip, Skeleton } from '@/design/components';
import { api, qk } from '@/lib/api/endpoints';
import { useLangFormat } from '@/lib/i18n/useLangFormat';
import { pickLocalized } from '@/lib/localized';
import { useReducedMotion } from '@/lib/prefs/store';

export interface SubmittedItem {
  grievance_id: string;
  guest_pin?: string;
}

function TicketId({ id }: { id: string }) {
  const reduced = useReducedMotion();
  return (
    <p className="font-mono text-3xl font-bold tracking-wider" aria-label={id} data-testid="ticket-id">
      {id.split('').map((ch, i) => (
        <motion.span
          key={i}
          aria-hidden
          className="inline-block"
          initial={reduced ? false : { opacity: 0, y: 12, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ delay: 0.2 + i * 0.035, duration: 0.3 }}
        >
          {ch}
        </motion.span>
      ))}
    </p>
  );
}

function PinBox({ pin }: { pin: string }) {
  const { t } = useTranslation('citizen');
  const [copied, setCopied] = useState(false);
  return (
    <div className="border-warning/50 bg-warning/10 space-y-2 rounded-[var(--radius-lg)] border-2 border-dashed p-4" data-testid="guest-pin">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-xs font-medium">{t('submitted.pin')}</p>
          <p className="font-mono text-3xl font-bold tracking-[0.3em]">{pin}</p>
        </div>
        <Button
          variant="outline"
          className="touch-target"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(pin);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            } catch {
              /* clipboard blocked: the PIN is still on screen */
            }
          }}
        >
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copied ? t('submitted.copied') : t('submitted.copy')}
        </Button>
      </div>
      <p className="flex items-start gap-2 text-sm">
        <TriangleAlert className="text-warning mt-0.5 size-4 shrink-0" aria-hidden />
        {t('submitted.save_pin')}
      </p>
    </div>
  );
}

function SubmittedCard({ item }: { item: SubmittedItem }) {
  const { t, i18n } = useTranslation('citizen');
  const fmt = useLangFormat();
  const q = useQuery({
    queryKey: qk.grievances.detail(item.grievance_id, item.guest_pin),
    queryFn: ({ signal }) => api.getGrievance(item.grievance_id, { pin: item.guest_pin, lang: i18n.language }, signal),
  });
  const g = q.data;
  const pinQuery = item.guest_pin ? `?pin=${item.guest_pin}` : '';
  const trackHref = item.guest_pin ? `/track?id=${item.grievance_id}&pin=${item.guest_pin}` : `/app/complaints/${item.grievance_id}`;
  const title = g ? pickLocalized(g.title, i18n.language) : null;
  return (
    <div className="space-y-4">
      <div>
        <p className="text-muted-foreground text-xs font-medium">{t('submitted.ticket')}</p>
        <TicketId id={item.grievance_id} />
      </div>
      {q.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : g ? (
        <div className="space-y-2">
          <p className="font-medium" lang={title!.lang} dir={title!.dir}>
            {title!.text}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <DepartmentBadge department={g.category} size="sm" />
            <PriorityChip priority={g.priority} size="sm" />
          </div>
          <p className="flex items-center gap-2 text-sm" data-testid="sla-due">
            <CalendarClock className="text-primary size-4" aria-hidden />
            {t('submitted.due', { date: fmt.dateTime(g.sla.due_at) })}
          </p>
        </div>
      ) : q.isError ? (
        // P6: the ticket exists even if its details can't load right now — say so and offer a retry.
        <ErrorState error={q.error} onRetry={() => q.refetch()} compact className="items-start p-0 text-start" />
      ) : null}
      {item.guest_pin && <PinBox pin={item.guest_pin} />}
      <div className="grid gap-2 sm:grid-cols-2">
        <Button asChild variant="outline" className="touch-target h-12">
          <Link to={`/print/receipt/${item.grievance_id}${pinQuery}`} data-testid="download-receipt">
            <Download className="size-4" aria-hidden />
            {t('submitted.receipt')}
          </Link>
        </Button>
        <Button asChild className="touch-target h-12">
          <Link to={trackHref} data-testid="track-now">
            <Search className="size-4" aria-hidden />
            {t('submitted.track')}
          </Link>
        </Button>
      </div>
    </div>
  );
}

export function SubmittedScreen({ items, onReportAnother }: { items: SubmittedItem[]; onReportAnother: () => void }) {
  const { t } = useTranslation('citizen');
  const reduced = useReducedMotion();
  return (
    <section className="bg-surface mx-auto w-full max-w-xl space-y-6 rounded-[var(--radius-xl)] border p-6" aria-labelledby="submitted-title" data-testid="submitted-screen">
      <Confetti />
      <header className="flex items-center gap-3">
        <motion.span
          className="bg-success/15 text-success grid size-12 place-items-center rounded-full"
          initial={reduced ? false : { scale: 0.3 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
        >
          <CheckCircle2 className="size-7" aria-hidden />
        </motion.span>
        <div>
          <h2 id="submitted-title" className="font-display text-xl font-semibold">
            {t('submitted.title', { count: items.length })}
          </h2>
          <p className="text-muted-foreground text-sm">{t('submitted.subtitle')}</p>
        </div>
      </header>
      {items.map((it, i) => (
        <div key={it.grievance_id} className={i > 0 ? 'border-t pt-6' : undefined}>
          <SubmittedCard item={it} />
        </div>
      ))}
      <Button variant="ghost" className="touch-target w-full" onClick={onReportAnother} data-testid="report-another">
        <Plus className="size-4" aria-hidden />
        {t('submitted.another')}
      </Button>
    </section>
  );
}
