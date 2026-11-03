// "I'm affected too" (feature 89–91, 105) for people who don't own the complaint (e.g. arriving from Nearby).
// The API only shows a complaint's details to its owner, so non-owners get a public-safe card with a support action.
import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { HandHeart, Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import type { DepartmentId, Localized, Status } from '@contracts/types';
import { Button } from '@/design/ui/button';
import { DepartmentBadge, StatusChip } from '@/design/components';
import { errorMessage } from '@/lib/api/client';
import { api, qk } from '@/lib/api/endpoints';
import { pickLocalized } from '@/lib/localized';
import { SupportCelebration } from '../report/DuplicateSheet';

/** What the Nearby list knows about a complaint (public-safe fields), passed as router state. */
export interface PublicSummary {
  title?: Localized;
  category?: DepartmentId;
  status?: Status;
  support_count?: number;
  distance_m?: number;
}

export function AffectedTooButton({ id, onDone, size = 'default' }: { id: string; onDone?: (count: number) => void; size?: 'default' | 'sm' }) {
  const { t } = useTranslation('citizen');
  const qc = useQueryClient();
  const [done, setDone] = useState(false);
  const support = useMutation({
    mutationFn: () => api.supportGrievance(id),
    onSuccess: (r) => {
      setDone(true);
      qc.invalidateQueries({ queryKey: qk.public.all });
      onDone?.(r.support_count + 1);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Button
      size={size}
      variant={done ? 'secondary' : 'default'}
      className="touch-target"
      disabled={done || support.isPending}
      onClick={() => support.mutate()}
      aria-pressed={done}
      data-testid={`affected-${id}`}
    >
      {support.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <HandHeart className="size-4" aria-hidden />}
      {done ? t('home.supported_short') : t('tracker.affected_too')}
    </Button>
  );
}

export function AffectedToo({ id, summary }: { id: string; summary?: PublicSummary }) {
  const { t, i18n } = useTranslation('citizen');
  const [count, setCount] = useState<number | null>(null);
  const title = summary?.title ? pickLocalized(summary.title, i18n.language) : null;
  if (count != null)
    return (
      <div className="space-y-3">
        <SupportCelebration count={count} />
        <Button asChild variant="ghost" className="touch-target mx-auto flex">
          <Link to="/app/nearby">{t('tracker.back_to_nearby')}</Link>
        </Button>
      </div>
    );
  return (
    <section className="bg-surface mx-auto max-w-xl space-y-4 rounded-[var(--radius-xl)] border p-6" data-testid="affected-too">
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Lock className="size-4" aria-hidden />
        {t('tracker.not_yours')}
      </p>
      <p className="text-muted-foreground font-mono text-sm">{id}</p>
      {title && (
        <h1 className="font-display text-xl font-semibold" lang={title.lang} dir={title.dir}>
          {title.text}
        </h1>
      )}
      {(summary?.category || summary?.status) && (
        <div className="flex flex-wrap gap-2">
          {summary.status && <StatusChip status={summary.status} />}
          {summary.category && <DepartmentBadge department={summary.category} />}
        </div>
      )}
      {summary?.support_count != null && <p className="text-sm">{t('tracker.affected', { count: summary.support_count + 1 })}</p>}
      <p className="text-sm">{t('tracker.affected_hint')}</p>
      <AffectedTooButton id={id} onDone={setCount} />
    </section>
  );
}
