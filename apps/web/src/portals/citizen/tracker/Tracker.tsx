// Complaint tracker (Spec A §5.10). Used by /app/complaints/:id (owner) and /track (guest with ticket + PIN).
import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { BadgeCheck, Clock3, Download, FileText, History, Languages, MapPin, Users } from 'lucide-react';
import type { GrievanceDetail, Lang } from '@contracts/types';
import { Button } from '@/design/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/design/ui/popover';
import { DepartmentBadge, LangBadge, ListenButton, PriorityChip, StatusChip, Timeline } from '@/design/components';
import { fadeUp, stagger } from '@/design/motion';
import { isRtl } from '@/lib/i18n';
import { useLangFormat } from '@/lib/i18n/useLangFormat';
import { pickLocalized } from '@/lib/localized';
import { useTranslated } from '../components/useTranslated';
import { EvidencePanel, MessagesThread, OfficeCard, Panel, SlaPanel } from './Panels';
import { completedSteps, StepProgress, STEP_KEYS } from './StepProgress';
import { ActionsPanel } from './Actions';

function ClosureLabel({ g }: { g: GrievanceDetail }) {
  const { t } = useTranslation('citizen');
  if (g.status !== 'closed' && g.status !== 'rejected') return null;
  const key = g.closure_type === 'citizen_verified' ? 'verified' : g.closure_type === 'auto_closed_unverified' ? 'auto' : 'rejected';
  return (
    <p
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${key === 'verified' ? 'bg-success/12 text-success' : key === 'auto' ? 'bg-warning/15 text-warning' : 'bg-surface-2 text-muted-foreground'}`}
      data-testid="closure-label"
      data-closure={g.closure_type ?? ''}
    >
      {key === 'verified' ? <BadgeCheck className="size-4" aria-hidden /> : <Clock3 className="size-4" aria-hidden />}
      {t(`tracker.closure.${key}`)}
    </p>
  );
}

export function Tracker({ g, pin, isOwner }: { g: GrievanceDetail; pin?: string; isOwner: boolean }) {
  const { t, i18n } = useTranslation('citizen');
  const { t: tc } = useTranslation('common');
  const fmt = useLangFormat();
  const ui = (i18n.resolvedLanguage ?? 'en') as Lang;
  const title = pickLocalized(g.title, ui);
  const [translate, setTranslate] = useState(false);
  const tr = useTranslated(title.text, ui, translate && title.lang !== ui);
  const shownTitle = translate && tr.data ? { text: tr.data.text, lang: ui } : title;
  const desc = pickLocalized(g.description, ui);
  const done = completedSteps(g);
  const currentStep = STEP_KEYS[Math.min(done, STEP_KEYS.length - 1)];
  // Status summary for the Listen button (feature 216), in the UI language.
  const summary = t('tracker.summary', {
    id: g.id.replace(/-/g, ' '),
    status: tc(`status.${g.status}`),
    dept: tc(`departments.${g.category}`),
    step: t(`tracker.steps.${currentStep}`),
    due: fmt.dateTime(g.sla.due_at),
  });
  const history = g.timeline.filter((e) => !e.internal);
  const pinQuery = pin ? `?pin=${pin}` : '';

  return (
    <motion.article variants={stagger()} initial="initial" animate="animate" className="space-y-5" data-testid="grievance-detail" data-status={g.status}>
      <motion.header variants={fadeUp} className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted-foreground font-mono text-sm" data-testid="tracker-id">
            {g.id}
          </p>
          <ListenButton text={summary} lang={ui} variant="outline" />
        </div>
        <h1 className="font-display text-2xl leading-snug font-semibold" lang={shownTitle.lang} dir={isRtl(shownTitle.lang) ? 'rtl' : 'ltr'}>
          {shownTitle.text}
        </h1>
        {title.lang !== ui && (
          <button type="button" onClick={() => setTranslate((v) => !v)} className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline">
            <Languages className="size-4" aria-hidden />
            {translate && tr.data ? t('complaints.show_original') : t('complaints.translate')}
          </button>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={g.status} />
          <Popover>
            <PopoverTrigger className="rounded-full" aria-label={t('tracker.why_priority')} data-testid="priority-popover">
              <PriorityChip priority={g.priority} score={g.priority_score} />
            </PopoverTrigger>
            <PopoverContent className="w-72 space-y-2">
              <p className="text-sm font-semibold">{t('tracker.why_priority')}</p>
              <ul className="space-y-1 text-sm" lang="en">
                {g.priority_factors.map((f) => (
                  <li key={f.key} className="flex justify-between gap-3">
                    <span>{f.label_en}</span>
                    <span className="tabular font-mono font-semibold">+{f.points}</span>
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
          <DepartmentBadge department={g.category} />
          <LangBadge lang={g.language} codeMixed={g.is_code_mixed} />
          {g.location.ward_name && (
            <span className="text-muted-foreground inline-flex items-center gap-1 text-sm">
              <MapPin className="size-4" aria-hidden />
              {g.location.ward_name}
            </span>
          )}
        </div>
        <ClosureLabel g={g} />
      </motion.header>

      <motion.section variants={fadeUp} className="bg-surface rounded-[var(--radius-lg)] border p-4" aria-labelledby="progress-title">
        <h2 id="progress-title" className="sr-only">
          {t('detail.timeline')}
        </h2>
        <StepProgress g={g} />
      </motion.section>

      <motion.div variants={fadeUp}>
        <ActionsPanel g={g} pin={pin} isOwner={isOwner} />
      </motion.div>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          <motion.section variants={fadeUp} className="bg-surface space-y-2 rounded-[var(--radius-lg)] border p-4">
            <p className="leading-relaxed" lang={desc.lang} dir={desc.dir}>
              {desc.text}
            </p>
            {g.support_count > 0 && (
              <p className="text-muted-foreground inline-flex items-center gap-1.5 text-sm" data-testid="affected-count">
                <Users className="size-4" aria-hidden />
                {t('tracker.affected', { count: g.support_count + 1 })}
              </p>
            )}
          </motion.section>
          <motion.div variants={fadeUp}>
            <EvidencePanel g={g} />
          </motion.div>
          <motion.div variants={fadeUp}>
            <MessagesThread g={g} pin={pin} canReply={isOwner && g.status !== 'rejected'} />
          </motion.div>
          <motion.div variants={fadeUp}>
            <Panel title={t('tracker.history')} icon={History} testId="history">
              <Timeline events={history} reverse />
            </Panel>
          </motion.div>
        </div>
        <aside className="space-y-5">
          <motion.div variants={fadeUp}>
            <SlaPanel g={g} />
          </motion.div>
          <motion.div variants={fadeUp}>
            <OfficeCard g={g} />
          </motion.div>
          <motion.div variants={fadeUp}>
            <Panel title={t('tracker.downloads')} icon={Download}>
              <div className="grid gap-2">
                <Button asChild variant="outline" className="touch-target justify-start">
                  <Link to={`/print/receipt/${g.id}${pinQuery}`} data-testid="tracker-receipt">
                    <FileText className="size-4" aria-hidden />
                    {t('submitted.receipt')}
                  </Link>
                </Button>
                <Button asChild variant="outline" className="touch-target justify-start">
                  <Link to={`/print/report/${g.id}${pinQuery}`} data-testid="tracker-report">
                    <Download className="size-4" aria-hidden />
                    {t('tracker.full_report')}
                  </Link>
                </Button>
              </div>
            </Panel>
          </motion.div>
        </aside>
      </div>
    </motion.article>
  );
}
