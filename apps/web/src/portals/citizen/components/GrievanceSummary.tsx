// Basic tracker view (P0). P4 builds the full tracker (Spec A §5.10).
import { useTranslation } from 'react-i18next';
import type { GrievanceDetail } from '@contracts/types';
import {
  AIBadge,
  BeforeAfterSlider,
  DepartmentBadge,
  LangBadge,
  ListenButton,
  PriorityChip,
  SLACountdown,
  StatusChip,
  Timeline,
} from '@/design/components';
import { pickLocalized } from '@/lib/localized';

export function GrievanceSummary({ g }: { g: GrievanceDetail }) {
  const { t, i18n } = useTranslation('citizen');
  const title = pickLocalized(g.title, i18n.language);
  const desc = pickLocalized(g.description, i18n.language);
  const before = g.media.find((m) => m.purpose === 'evidence');
  const after = g.media.find((m) => m.purpose === 'resolution_proof');
  const stopped = ['closed', 'rejected', 'merged', 'resolved_pending_verification'].includes(g.status);
  return (
    <article className="space-y-6" data-testid="grievance-detail">
      <header className="space-y-3">
        <p className="text-muted-foreground font-mono text-sm">{g.id}</p>
        <h1 className="font-display text-2xl font-semibold" lang={title.lang} dir={title.dir}>
          {title.text}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={g.status} />
          <PriorityChip priority={g.priority} score={g.priority_score} />
          <DepartmentBadge department={g.category} />
          <LangBadge lang={g.language} codeMixed={g.is_code_mixed} />
          <SLACountdown sla={g.sla} stopped={stopped} />
        </div>
      </header>
      <section className="bg-surface space-y-2 rounded-[var(--radius-lg)] border p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="leading-relaxed" lang={desc.lang} dir={desc.dir}>
            {desc.text}
          </p>
          <ListenButton text={desc.text} lang={desc.lang as GrievanceDetail['language']} size="icon" />
        </div>
        <AIBadge variant="approved" />
        {g.support_count > 0 && (
          <p className="text-muted-foreground text-sm">{t('detail.support', { count: g.support_count })}</p>
        )}
        {g.assigned_officer && (
          <p className="text-muted-foreground text-sm">
            {t('detail.officer')}: <span className="text-text">{g.assigned_officer.name}</span> ·{' '}
            {g.assigned_officer.office_name}
          </p>
        )}
      </section>
      {before && after && (
        <section className="space-y-2">
          <h2 className="font-display text-lg font-semibold">{t('detail.proof')}</h2>
          <BeforeAfterSlider
            before={before.url}
            after={after.url}
            beforeAlt={before.ai?.description_en}
            afterAlt={after.ai?.description_en}
          />
        </section>
      )}
      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">{t('detail.timeline')}</h2>
        <Timeline events={g.timeline} />
      </section>
    </article>
  );
}
