// P0 citizen home: greeting, 4 action tiles, active complaints (Spec A §5.3 — P1 completes it).
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Camera, Keyboard, Mic, Search } from 'lucide-react';
import { motion } from 'motion/react';
import { EmptyState, ErrorState, ListSkeleton, PageTransition } from '@/design/components';
import { listItem, pressable, stagger } from '@/design/motion';
import { api, qk } from '@/lib/api/endpoints';
import { useAuth } from '@/lib/auth/useAuth';
import { GrievanceCard } from '../components/GrievanceCard';

const OPEN = [
  'registered',
  'needs_review',
  'assigned',
  'in_progress',
  'reopened',
  'resolved_pending_verification',
] as const;

const TILES = [
  { key: 'voice', to: '/app/report?mode=voice', icon: Mic, tone: 'bg-primary text-primary-foreground' },
  { key: 'photo', to: '/app/report/quick', icon: Camera, tone: 'bg-surface border' },
  { key: 'type', to: '/app/report?mode=text', icon: Keyboard, tone: 'bg-surface border' },
  { key: 'track', to: '/app/complaints', icon: Search, tone: 'bg-surface border' },
] as const;

export default function Home() {
  const { t } = useTranslation('citizen');
  const { profile } = useAuth();
  const q = useQuery({
    queryKey: qk.grievances.mine({ status: [...OPEN] }),
    queryFn: ({ signal }) => api.myGrievances({ status: [...OPEN] }, signal),
  });
  return (
    <PageTransition className="space-y-8">
      <header>
        <h1 className="font-display text-2xl font-semibold md:text-3xl">
          {profile?.role === 'guest' || !profile
            ? t('home.greeting_guest')
            : t('home.greeting', { name: profile.name.split(' ')[0] })}
        </h1>
        <p className="text-muted-foreground">{t('home.subtitle')}</p>
      </header>

      <motion.div
        variants={stagger()}
        initial="initial"
        animate="animate"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        {TILES.map(({ key, to, icon: Icon, tone }, i) => (
          <motion.div key={key} custom={i} variants={listItem} {...pressable}>
            <Link
              to={to}
              className={`flex min-h-32 flex-col justify-between rounded-[var(--radius-xl)] p-4 ${tone}`}
              data-testid={`tile-${key}`}
            >
              <Icon className="size-8" aria-hidden />
              <span className="font-display text-lg leading-tight font-semibold">{t(`tiles.${key}`)}</span>
            </Link>
          </motion.div>
        ))}
      </motion.div>

      <section className="space-y-3" aria-live="polite">
        <h2 className="font-display text-lg font-semibold">{t('home.active')}</h2>
        {q.isPending ? (
          <ListSkeleton rows={2} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : q.data.items.length === 0 ? (
          <EmptyState title={t('home.empty_title')} description={t('home.empty_body')} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {q.data.items.map((g) => (
              <GrievanceCard key={g.id} g={g} />
            ))}
          </div>
        )}
      </section>
    </PageTransition>
  );
}
