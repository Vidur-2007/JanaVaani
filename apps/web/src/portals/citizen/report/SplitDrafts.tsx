// Multiple issues in one message (feature 37): one card per draft with an include checkbox → split_confirm.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Loader2, Split } from 'lucide-react';
import type { GrievanceDraft } from '@contracts/types';
import { Button } from '@/design/ui/button';
import { Checkbox } from '@/design/ui/checkbox';
import { Label } from '@/design/ui/label';
import { Switch } from '@/design/ui/switch';
import { AIBadge, DepartmentBadge, PriorityChip } from '@/design/components';
import { isRtl } from '@/lib/i18n';
import { usePrefs } from '@/lib/prefs/store';
import { cn } from '@/lib/utils';
import type { ConfirmOptions } from './ConfirmationCard';

export function SplitDrafts({
  drafts,
  busy,
  onConfirm,
  onCancel,
}: {
  drafts: GrievanceDraft[];
  busy?: boolean;
  onConfirm: (draftIds: string[], o: ConfirmOptions) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('citizen');
  const { t: tc } = useTranslation('common');
  const anonDefault = usePrefs((s) => s.anonymous_default);
  const [include, setInclude] = useState<Record<string, boolean>>(() => Object.fromEntries(drafts.map((d) => [d.draft_id, true])));
  const [anon, setAnon] = useState(anonDefault);
  const chosen = drafts.filter((d) => include[d.draft_id]).map((d) => d.draft_id);

  return (
    <section className="bg-surface shadow-glow-ai mx-auto w-full max-w-xl space-y-4 rounded-[var(--radius-xl)] border p-5" aria-labelledby="split-title" data-testid="split-drafts">
      <header className="flex items-start justify-between gap-3">
        <h2 id="split-title" className="font-display flex items-center gap-2 text-lg font-semibold">
          <Split className="text-ai size-5" aria-hidden />
          {t('split.title', { count: drafts.length })}
        </h2>
        <AIBadge variant="suggested" />
      </header>
      <p className="text-muted-foreground text-sm">{t('split.subtitle')}</p>
      <ul className="space-y-2">
        {drafts.map((d, i) => {
          const on = !!include[d.draft_id];
          const id = `split-${d.draft_id}`;
          return (
            <li key={d.draft_id} className={cn('rounded-[var(--radius-lg)] border-2 p-4 transition-colors', on ? 'border-primary/50 bg-primary/5' : 'border-transparent bg-surface-2 opacity-70')}>
              <div className="flex items-start gap-3">
                <Checkbox id={id} checked={on} onCheckedChange={(v) => setInclude((s) => ({ ...s, [d.draft_id]: v === true }))} className="mt-1 size-5" data-testid={`split-include-${i}`} />
                <div className="min-w-0 flex-1 space-y-2">
                  <Label htmlFor={id} className="block text-base leading-snug font-medium" lang={d.title.lang} dir={isRtl(d.title.lang) ? 'rtl' : 'ltr'}>
                    {d.title.original}
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    <DepartmentBadge department={d.category} size="sm" />
                    {d.priority_preview && <PriorityChip priority={d.priority_preview.level} score={d.priority_preview.score} size="sm" />}
                  </div>
                  {d.routing_preview?.officer_name && <p className="text-muted-foreground text-xs">{t('split.goes_to', { officer: d.routing_preview.officer_name })}</p>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex min-h-12 items-center gap-3">
        <Label htmlFor="split-anon" className="flex-1 text-base">
          {t('confirm.anonymous')}
        </Label>
        <Switch id="split-anon" checked={anon} onCheckedChange={setAnon} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button className="touch-target h-12 flex-1 text-base" disabled={busy || !chosen.length} onClick={() => onConfirm(chosen, { is_anonymous: anon, is_private: false })} data-testid="split-submit">
          {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Check className="size-5" aria-hidden />}
          {t('split.submit', { count: chosen.length })}
        </Button>
        <Button variant="ghost" className="touch-target h-12" onClick={onCancel} disabled={busy}>
          {tc('actions.cancel')}
        </Button>
      </div>
    </section>
  );
}
