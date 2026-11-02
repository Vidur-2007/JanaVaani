// Tracker panels (Spec A §5.10): SLA, office, evidence + AI verification, message thread.
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Building2, CalendarClock, HelpCircle, Loader2, Phone, SendHorizontal, ShieldAlert, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import type { DeepLang, GrievanceDetail, Message } from '@contracts/types';
import { Button } from '@/design/ui/button';
import { AIBadge, BeforeAfterSlider, SLACountdown } from '@/design/components';
import { errorMessage } from '@/lib/api/client';
import { api, qk } from '@/lib/api/endpoints';
import { useLangFormat } from '@/lib/i18n/useLangFormat';
import { isRtl } from '@/lib/i18n';
import { pickLocalized } from '@/lib/localized';
import { cn } from '@/lib/utils';
import { mediaUrl } from '@/lib/api/client';

export function Panel({ title, icon: Icon, children, className, testId }: { title: string; icon?: typeof Building2; children: ReactNode; className?: string; testId?: string }) {
  return (
    <section className={cn('bg-surface space-y-3 rounded-[var(--radius-lg)] border p-4', className)} data-testid={testId}>
      <h2 className="font-display flex items-center gap-2 text-base font-semibold">
        {Icon && <Icon className="text-primary size-5" aria-hidden />}
        {title}
      </h2>
      {children}
    </section>
  );
}

const STOPPED = ['closed', 'rejected', 'merged', 'resolved_pending_verification'];

export function SlaPanel({ g }: { g: GrievanceDetail }) {
  const { t, i18n } = useTranslation('citizen');
  const fmt = useLangFormat();
  const etaDays = g.sla.eta_at ? Math.max(1, Math.round((Date.parse(g.sla.eta_at) - Date.parse(g.created_at)) / 86_400_000)) : null;
  const delay = g.sla.delay_reason ? pickLocalized(g.sla.delay_reason, i18n.language) : null;
  const level = g.escalation_level;
  return (
    <Panel title={t('tracker.sla_title')} icon={CalendarClock} testId="sla-panel">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">{t('tracker.due')}</dt>
        <dd>{fmt.dateTime(g.sla.due_at)}</dd>
        <dt className="text-muted-foreground">{t('tracker.time_left')}</dt>
        <dd>
          <SLACountdown sla={g.sla} stopped={STOPPED.includes(g.status)} />
        </dd>
        {etaDays && !STOPPED.includes(g.status) && (
          <>
            <dt className="text-muted-foreground">{t('tracker.eta')}</dt>
            <dd>
              {t('tracker.eta_value', { count: etaDays })}
              <span className="text-muted-foreground block text-xs">{t('tracker.eta_note')}</span>
            </dd>
          </>
        )}
      </dl>
      {delay && (
        <p className="bg-warning/12 flex items-start gap-2 rounded-lg p-3 text-sm" lang={delay.lang} dir={delay.dir} data-testid="delay-reason">
          <TriangleAlert className="text-warning mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <span className="font-medium">{t('tracker.delay')}: </span>
            {delay.text}
          </span>
        </p>
      )}
      <div className="flex items-center gap-3 text-sm" data-testid="escalation">
        <span className="text-muted-foreground">{t('tracker.escalation')}</span>
        <span className="flex gap-1" aria-hidden>
          {[1, 2].map((n) => (
            <span key={n} className={cn('size-2.5 rounded-full', level >= n ? 'bg-danger' : 'bg-surface-2 border')} />
          ))}
        </span>
        <span className={cn(level > 0 && 'text-danger font-medium')}>{t(`tracker.escalation_level.${Math.min(level, 2)}`)}</span>
      </div>
    </Panel>
  );
}

export function OfficeCard({ g }: { g: GrievanceDetail }) {
  const { t } = useTranslation('citizen');
  const o = g.assigned_officer;
  return (
    <Panel title={t('tracker.office_title')} icon={Building2} testId="office-card">
      {o ? (
        <div className="space-y-1 text-sm">
          <p className="font-medium">{o.name}</p>
          <p className="text-muted-foreground">{o.designation}</p>
          <p>{o.office_name}</p>
          {o.office_phone && (
            <a href={`tel:${o.office_phone}`} className="text-primary touch-target inline-flex items-center gap-2 font-medium">
              <Phone className="size-4" aria-hidden />
              {o.office_phone}
            </a>
          )}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">{g.status === 'needs_review' ? t('tracker.office_review') : t('tracker.office_pending')}</p>
      )}
    </Panel>
  );
}

const VERDICT: Record<string, { icon: typeof BadgeCheck; cls: string }> = {
  verified: { icon: BadgeCheck, cls: 'bg-success/12 text-success border-success/40' },
  suspicious: { icon: ShieldAlert, cls: 'bg-danger/10 text-danger border-danger/40' },
  unclear: { icon: HelpCircle, cls: 'bg-warning/15 text-warning border-warning/40' },
};

export function EvidencePanel({ g }: { g: GrievanceDetail }) {
  const { t } = useTranslation('citizen');
  const before = g.media.filter((m) => m.purpose === 'evidence');
  const after = g.media.filter((m) => m.purpose === 'resolution_proof');
  const v = g.ai_verification;
  if (!before.length && !after.length) return null;
  const V = v ? VERDICT[v.verdict] : null;
  return (
    <Panel title={t('detail.proof')} testId="evidence">
      {before[0] && after[0] ? (
        <BeforeAfterSlider before={before[0].url} after={after[0].url} beforeAlt={before[0].ai?.description_en} afterAlt={after[0].ai?.description_en} />
      ) : (
        <div className="flex gap-2 overflow-x-auto">
          {[...before, ...after].map((m) => (
            <img key={m.id} src={mediaUrl(m.url)} alt={m.ai?.description_en ?? t('report.photo_alt')} className="size-28 shrink-0 rounded-xl border object-cover" />
          ))}
        </div>
      )}
      {v && V && (
        <div className={cn('space-y-2 rounded-xl border p-3', V.cls)} data-testid="ai-verification" data-verdict={v.verdict}>
          <div className="flex flex-wrap items-center gap-2">
            <V.icon className="size-5" aria-hidden />
            <span className="font-semibold">{t(`tracker.verdict.${v.verdict}`)}</span>
            <AIBadge variant="generated" />
          </div>
          <ul className="text-text space-y-0.5 text-sm" lang="en">
            {v.reasons_en.map((r) => (
              <li key={r}>• {r}</li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

function MessageBubble({ m, ui }: { m: Message; ui: string }) {
  const { t } = useTranslation('citizen');
  const fmt = useLangFormat();
  const [en, setEn] = useState(false);
  const mine = m.sender === 'citizen';
  const picked = pickLocalized(m.text, ui);
  const text = en ? m.text.en : picked.text;
  const lang = en ? 'en' : picked.lang;
  return (
    <li className={cn('flex flex-col gap-1', mine ? 'items-end' : 'items-start')}>
      <div className={cn('max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed', mine ? 'bg-primary text-primary-foreground rounded-ee-sm' : 'bg-surface-2 rounded-es-sm')} lang={lang} dir={isRtl(lang) ? 'rtl' : 'ltr'}>
        {text}
      </div>
      <p className="text-muted-foreground flex items-center gap-2 px-1 text-xs">
        {!mine && <span>{m.sender_name ?? t(`tracker.sender.${m.sender}`)}</span>}
        <time dateTime={m.created_at}>{fmt.dateTime(m.created_at)}</time>
        {!mine && m.text.lang !== 'en' && m.text.en !== m.text.original && (
          <button type="button" className="underline-offset-2 hover:underline" onClick={() => setEn((v) => !v)}>
            {en ? t('report.show_original') : t('tracker.see_english')}
          </button>
        )}
      </p>
    </li>
  );
}

export function MessagesThread({ g, pin, canReply }: { g: GrievanceDetail; pin?: string; canReply: boolean }) {
  const { t, i18n } = useTranslation('citizen');
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const send = useMutation({
    mutationFn: () => api.sendMessage(g.id, { text: text.trim(), ui_lang: (i18n.resolvedLanguage ?? 'en') as DeepLang }, { pin }),
    onSuccess: () => {
      setText('');
      qc.invalidateQueries({ queryKey: qk.grievances.details });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const msgs = g.messages.filter((m) => m.sender !== 'system');
  return (
    <Panel title={t('tracker.messages')} testId="messages">
      {msgs.length ? (
        <ul className="space-y-3" aria-live="polite">
          {msgs.map((m) => (
            <MessageBubble key={m.id} m={m} ui={i18n.language} />
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{t('tracker.no_messages')}</p>
      )}
      {canReply && (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) send.mutate();
          }}
        >
          <label htmlFor="reply" className="sr-only">
            {t('tracker.reply')}
          </label>
          <textarea
            id="reply"
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('tracker.reply_placeholder')}
            className="bg-bg max-h-32 min-h-11 flex-1 resize-y rounded-xl border px-3 py-2.5"
            dir="auto"
            data-testid="reply-input"
          />
          <Button type="submit" size="icon" className="touch-target rounded-full" disabled={!text.trim() || send.isPending} aria-label={t('tracker.reply')} data-testid="reply-send">
            {send.isPending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <SendHorizontal className="rtl-flip size-5" aria-hidden />}
          </Button>
        </form>
      )}
    </Panel>
  );
}
