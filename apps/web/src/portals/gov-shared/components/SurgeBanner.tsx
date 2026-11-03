// Spec C §11 S1: the Surge Mode banner on the admin Command Center. It appears only when the alert feed holds a
// surge (a critical spike, or a spike with ≥ 10 complaints) and opens that alert's war room.
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Siren } from 'lucide-react';
import { Button } from '@/design/ui/button';
import { api, qk } from '@/lib/api/endpoints';
import { useReducedMotion } from '@/lib/prefs/store';
import { surgeAlerts } from '../lib/surge';

export function SurgeBanner() {
  const { t } = useTranslation('gov');
  const reduced = useReducedMotion();
  const alerts = useQuery({ queryKey: qk.admin.alerts, queryFn: ({ signal }) => api.alerts(signal) });
  const surges = surgeAlerts(alerts.data);
  if (!surges.length) return null;
  const s = surges[0];
  return (
    <motion.div
      role="status"
      initial={reduced ? false : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="border-danger/50 bg-danger/10 flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border p-3"
      data-testid="surge-banner"
    >
      <span className="bg-danger/20 text-danger relative grid size-10 shrink-0 place-items-center rounded-full">
        <Siren className="size-5" aria-hidden />
        {!reduced && (
          <span
            className="border-danger absolute inset-0 animate-ping rounded-full border opacity-40"
            aria-hidden
          />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-danger font-semibold">{t('surge.banner_title')}</p>
        <p className="text-muted-foreground truncate text-sm">
          {/* The alert title carries the real count (B lists only example ids). */}
          {s.title_en}
          {surges.length > 1 && ` · ${t('surge.more', { count: surges.length - 1 })}`}
        </p>
      </div>
      <Button asChild variant="destructive" className="min-h-11 md:min-h-9">
        <Link to={`/admin/surge/${encodeURIComponent(s.id)}`} data-testid="surge-open">
          {t('surge.open_war_room')}
        </Link>
      </Button>
    </motion.div>
  );
}
