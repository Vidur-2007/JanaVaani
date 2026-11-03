// Complaint card for lists: title in the preferred language (original if it matches the UI, else English) with a
// "Translate" link via /translate (cached), status, priority, department, SLA countdown, support count.
import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Languages, Loader2, Users } from 'lucide-react';
import type { Grievance, Lang } from '@contracts/types';
import { DepartmentBadge, PriorityChip, SLACountdown, StatusChip } from '@/design/components';
import { isRtl } from '@/lib/i18n';
import { pickLocalized } from '@/lib/localized';
import { useTranslated } from './useTranslated';

const STOPPED = ['closed', 'rejected', 'merged', 'resolved_pending_verification'];

export function GrievanceCard({ g, to }: { g: Grievance; to?: string }) {
  const { t, i18n } = useTranslation('citizen');
  const ui = (i18n.resolvedLanguage ?? 'en') as Lang;
  const title = pickLocalized(g.title, ui);
  // Offer translation when what we show is not in the UI language.
  const canTranslate = title.lang !== ui;
  const [wantTranslation, setWantTranslation] = useState(false);
  const tr = useTranslated(title.text, ui, canTranslate && wantTranslation);
  const shown = wantTranslation && tr.data ? { text: tr.data.text, lang: ui, dir: isRtl(ui) ? 'rtl' : 'ltr' } : title;
  return (
    <article className="bg-surface hover:border-primary/40 group relative rounded-[var(--radius-lg)] border p-4 transition-colors" data-testid="grievance-card">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip status={g.status} size="sm" />
        <PriorityChip priority={g.priority} size="sm" />
        <DepartmentBadge department={g.category} size="sm" />
      </div>
      <div className="mt-2 flex items-start justify-between gap-3">
        <Link to={to ?? `/app/complaints/${g.id}`} className="font-medium after:absolute after:inset-0" lang={shown.lang} dir={shown.dir}>
          {shown.text}
        </Link>
        <ChevronRight className="rtl-flip text-muted-foreground mt-0.5 size-5 shrink-0" aria-hidden />
      </div>
      <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="font-mono">{g.id}</span>
        {g.location.ward_name && <span>{g.location.ward_name}</span>}
        {g.support_count > 0 && (
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" aria-hidden />
            {g.support_count}
          </span>
        )}
        <SLACountdown sla={g.sla} stopped={STOPPED.includes(g.status)} compact />
        {canTranslate && (
          <button
            type="button"
            onClick={() => setWantTranslation((v) => !v)}
            className="text-primary relative z-10 inline-flex items-center gap-1 font-medium hover:underline"
            data-testid="translate-title"
          >
            {tr.isFetching ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Languages className="size-3.5" aria-hidden />}
            {wantTranslation && tr.data ? t('complaints.show_original') : t('complaints.translate')}
          </button>
        )}
      </div>
    </article>
  );
}
