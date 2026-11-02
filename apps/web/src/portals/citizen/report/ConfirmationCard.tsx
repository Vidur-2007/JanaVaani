// ConfirmationCard (Spec A §5.4, features 20, 21, 53, 45, 48, 70). Shared by the chat and the quick report.
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Info, Loader2, MapPin, Pencil, X } from 'lucide-react';
import type { DeepLang, GrievanceDraft, Location, Media } from '@contracts/types';
import { Button } from '@/design/ui/button';
import { Label } from '@/design/ui/label';
import { Switch } from '@/design/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/design/ui/tooltip';
import { AIBadge, DepartmentBadge, PriorityChip, Skeleton } from '@/design/components';
import { useDepartmentMap } from '@/lib/api/hooks';
import { isRtl } from '@/lib/i18n';
import { pickRecord } from '@/lib/localized';
import { usePrefs } from '@/lib/prefs/store';
import { cn } from '@/lib/utils';
import { locationLabel } from './LocationSheet';
import { mediaUrl } from '@/lib/api/client';

const LocationMap = lazy(() => import('./LocationMap'));

export interface ConfirmOptions {
  is_anonymous: boolean;
  is_private: boolean;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 border-t pt-4">
      <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{title}</h3>
      {children}
    </section>
  );
}

function ToggleRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex min-h-12 items-center gap-3">
      <Label htmlFor={id} className="flex-1 text-base">
        {label}
      </Label>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="text-muted-foreground touch-target grid place-items-center"
            aria-label={hint}
          >
            <Info className="size-4" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-64">{hint}</TooltipContent>
      </Tooltip>
      <Switch id={id} checked={checked} onCheckedChange={onChange} data-testid={id} />
    </div>
  );
}

export function ConfirmationCard({
  draft,
  location,
  media = [],
  uiLang,
  busy,
  onConfirm,
  onEdit,
  onCancel,
  onAddLocation,
  editSignal = 0,
}: {
  draft: GrievanceDraft;
  location?: Location;
  media?: Media[];
  uiLang: DeepLang;
  busy?: boolean;
  onConfirm: (o: ConfirmOptions) => void;
  onEdit?: (text: string) => void;
  onCancel?: () => void;
  onAddLocation?: () => void;
  /** Incrementing this opens the inline editor (e.g. after saying "no" in voice mode). */
  editSignal?: number;
}) {
  const { t } = useTranslation('citizen');
  const { t: tc } = useTranslation('common');
  const prefs = usePrefs();
  const depts = useDepartmentMap();
  const [view, setView] = useState<'formal' | 'english' | 'original'>('formal');
  const [anon, setAnon] = useState(prefs.anonymous_default);
  const [priv, setPriv] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(draft.cleaned_original);
  useEffect(() => {
    if (editSignal > 0) setEditing(true);
  }, [editSignal]);

  const loc = location ?? draft.location;
  const routing = draft.routing_preview;
  const priority = draft.priority_preview;
  const easy = prefs.low_literacy;
  const textLang = view === 'english' ? 'en' : draft.formal_text.lang;
  const shown =
    view === 'english'
      ? draft.formal_text.en
      : view === 'original'
        ? draft.cleaned_original
        : draft.formal_text.original;
  const dept = depts[draft.category];
  const fieldLabel = (key: string) => {
    const f = dept?.required_fields.find((x) => x.key === key);
    return t(`report.fields.${key}`, { defaultValue: f?.label_en ?? key.replace(/_/g, ' ') });
  };
  const confidence = Math.round((routing?.confidence ?? 0) * 100);
  const confirm = () => onConfirm({ is_anonymous: anon, is_private: priv });

  return (
    <article
      className="bg-surface shadow-glow-ai mx-auto w-full max-w-xl space-y-4 rounded-[var(--radius-xl)] border p-5"
      aria-labelledby="confirm-title"
      data-testid="confirmation-card"
    >
      <header className="flex items-start justify-between gap-3">
        <h2 id="confirm-title" className="font-display text-lg font-semibold">
          {t('confirm.title')}
        </h2>
        <AIBadge variant="suggested" />
      </header>

      {/* Complaint text: formal (citizen language) · English · original words */}
      <div className="space-y-2">
        <p
          className="font-display text-xl leading-snug font-semibold"
          lang={draft.title.lang}
          dir={isRtl(draft.title.lang) ? 'rtl' : 'ltr'}
        >
          {draft.title.original}
        </p>
        {editing ? (
          <div className="space-y-2">
            <label htmlFor="edit-text" className="sr-only">
              {t('confirm.edit_label')}
            </label>
            <textarea
              id="edit-text"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={4}
              className="bg-bg w-full rounded-xl border p-3"
              dir="auto"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  onEdit?.(editText.trim());
                  setEditing(false);
                }}
                disabled={editText.trim().length < 5}
              >
                {tc('actions.save')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                {tc('actions.cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <p
            className="bg-surface-2 rounded-xl p-3 leading-relaxed"
            lang={textLang}
            dir={isRtl(textLang) ? 'rtl' : 'ltr'}
            data-testid="confirm-text"
          >
            {shown}
          </p>
        )}
        {!easy && (
          <div className="flex flex-wrap gap-1" role="group" aria-label={t('confirm.text_views')}>
            {(['formal', 'english', 'original'] as const).map((v) => (
              <Button
                key={v}
                size="sm"
                variant={view === v ? 'secondary' : 'ghost'}
                className="h-9"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                data-testid={`view-${v}`}
              >
                {t(`confirm.view_${v}`)}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Routing preview */}
      <Section title={t('confirm.routing')}>
        <div className="flex flex-wrap items-center gap-2">
          <DepartmentBadge department={draft.category} />
          {draft.sub_department && (
            <span className="bg-surface-2 rounded-full px-2.5 py-1 text-xs">
              {t(`report.sub.${draft.sub_department}`, {
                defaultValue: draft.sub_department.replace(/_/g, ' '),
              })}
            </span>
          )}
        </div>
        <p className="text-sm" data-testid="routing-line">
          {t('confirm.will_go_to', {
            dept: pickRecord(dept?.name, uiLang) || tc(`departments.${draft.category}`),
            zone: loc?.zone ? t('confirm.zone', { zone: loc.zone }) : '',
            officer: routing?.officer_name
              ? `${routing.officer_name}${routing.office_name ? ` (${routing.office_name})` : ''}`
              : t('confirm.officer_tbd'),
          })}
        </p>
        {!easy && (
          <>
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground text-xs">{t('confirm.confidence')}</span>
              <div
                className="bg-surface-2 h-2 flex-1 overflow-hidden rounded-full"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={confidence}
                aria-label={t('confirm.confidence')}
              >
                <div
                  className={cn(
                    'h-full rounded-full',
                    confidence >= 75 ? 'bg-success' : confidence >= 60 ? 'bg-warning' : 'bg-danger',
                  )}
                  style={{ width: `${confidence}%` }}
                />
              </div>
              <span className="tabular w-10 text-end font-mono text-xs">{confidence}%</span>
            </div>
            {routing?.explanation_en && (
              <p className="text-muted-foreground text-xs" lang="en">
                {routing.explanation_en}
              </p>
            )}
          </>
        )}
        {routing?.needs_review && (
          <p className="bg-warning/12 rounded-lg p-2 text-xs">{t('confirm.needs_review')}</p>
        )}
      </Section>

      {/* Priority */}
      {priority && (
        <Section title={t('confirm.priority')}>
          <div className="flex flex-wrap items-center gap-3">
            <PriorityChip priority={priority.level} score={priority.score} />
            <span className="text-sm">{t('confirm.sla', { hours: priority.sla_hours })}</span>
          </div>
          {!easy && (
            <ul className="flex flex-wrap gap-1.5" data-testid="priority-factors">
              {priority.factors.map((f) => (
                <li key={f.key} className="bg-surface-2 rounded-full px-2.5 py-1 text-xs" lang="en">
                  {f.label_en} <span className="tabular font-mono font-semibold">+{f.points}</span>
                </li>
              ))}
            </ul>
          )}
          {priority.level === 'critical' && (
            <p className="text-muted-foreground text-xs">{t('confirm.critical_note')}</p>
          )}
        </Section>
      )}

      {/* Location + photos + collected fields */}
      <Section title={t('confirm.where')}>
        {loc ? (
          <>
            <p className="flex items-center gap-2 text-sm">
              <MapPin className="text-primary size-4 shrink-0" aria-hidden />
              <span>
                {locationLabel(loc)}
                {loc.ward_name && loc.ward_name !== locationLabel(loc) ? ` · ${loc.ward_name}` : ''}
              </span>
            </p>
            <Suspense fallback={<Skeleton className="h-36 w-full rounded-[var(--radius-lg)]" />}>
              <LocationMap pin={loc} height={144} />
            </Suspense>
          </>
        ) : (
          <div className="bg-warning/12 flex items-center justify-between gap-2 rounded-lg p-3 text-sm">
            <span>{t('confirm.no_location')}</span>
            {onAddLocation && (
              <Button size="sm" variant="outline" onClick={onAddLocation}>
                <MapPin className="size-4" aria-hidden />
                {t('report.share_location')}
              </Button>
            )}
          </div>
        )}
        {media.length > 0 && (
          <div className="flex gap-2 overflow-x-auto">
            {media.map((m) => (
              <img
                key={m.id}
                src={mediaUrl(m.url)}
                alt={m.ai?.description_en ?? t('report.photo_alt')}
                className="size-20 shrink-0 rounded-xl border object-cover"
              />
            ))}
          </div>
        )}
        {!easy && Object.keys(draft.fields).length > 0 && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {Object.entries(draft.fields).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{fieldLabel(k)}</dt>
                <dd dir="auto">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </Section>

      <Section title={t('confirm.privacy')}>
        <ToggleRow
          id="anonymous"
          label={t('confirm.anonymous')}
          hint={t('confirm.anonymous_hint')}
          checked={anon}
          onChange={setAnon}
        />
        <ToggleRow
          id="private"
          label={t('confirm.private')}
          hint={t('confirm.private_hint')}
          checked={priv}
          onChange={setPriv}
        />
      </Section>

      {prefs.voice_first && (
        <p className="text-muted-foreground text-center text-sm">{t('confirm.voice_hint')}</p>
      )}

      {easy ? (
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button
            onClick={confirm}
            disabled={busy}
            className="bg-success hover:bg-success/90 h-20 rounded-2xl text-white"
            aria-label={t('confirm.submit')}
            data-testid="confirm-submit"
          >
            {busy ? (
              <Loader2 className="size-8 animate-spin" aria-hidden />
            ) : (
              <Check className="size-10" aria-hidden />
            )}
          </Button>
          <Button
            onClick={() => setEditing(true)}
            variant="outline"
            className="border-danger/40 text-danger h-20 rounded-2xl"
            aria-label={tc('actions.edit')}
          >
            <X className="size-10" aria-hidden />
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 pt-2">
          <Button
            onClick={confirm}
            disabled={busy}
            className="touch-target h-12 flex-1 text-base"
            data-testid="confirm-submit"
          >
            {busy ? (
              <Loader2 className="size-5 animate-spin" aria-hidden />
            ) : (
              <Check className="size-5" aria-hidden />
            )}
            {t('confirm.submit')}
          </Button>
          {onEdit && (
            <Button
              variant="outline"
              className="touch-target h-12"
              onClick={() => setEditing(true)}
              disabled={busy}
            >
              <Pencil className="size-4" aria-hidden />
              {tc('actions.edit')}
            </Button>
          )}
          {onCancel && (
            <Button variant="ghost" className="touch-target h-12" onClick={onCancel} disabled={busy}>
              {tc('actions.cancel')}
            </Button>
          )}
        </div>
      )}
    </article>
  );
}
