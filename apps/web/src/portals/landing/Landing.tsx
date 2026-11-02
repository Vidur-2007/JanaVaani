// P0 landing: hero with cycling multilingual greeting, CTAs, live stats and portal cards.
// P1 replaces the gradient hero with the 3D City Pulse (Spec A §5.1).
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Building2, Globe2, Landmark, Mic, Search, UserRound } from 'lucide-react';
import { Button } from '@/design/ui/button';
import {
  ErrorState,
  KPIStat,
  LanguageSwitcher,
  LiveIndicator,
  Logo,
  PageTransition,
  StatSkeleton,
  ThemeToggle,
} from '@/design/components';
import { reveal } from '@/design/motion';
import { api, qk } from '@/lib/api/endpoints';
import { useLangFormat } from '@/lib/i18n/useLangFormat';
import { useReducedMotion, useSurfaceTheme } from '@/lib/prefs/store';
import { SmoothScroll } from '@/app/providers';

function CyclingGreeting() {
  const { t } = useTranslation('landing');
  const greetings = t('hero.greetings', { returnObjects: true }) as string[];
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setI((x) => (x + 1) % greetings.length), 3200);
    return () => window.clearInterval(id);
  }, [greetings.length]);
  return (
    <h1 className="font-display relative min-h-[2.6em] text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl md:text-7xl">
      <AnimatePresence mode="wait">
        <motion.span
          key={i}
          className="block"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 18, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: -18, filter: 'blur(8px)' }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          {greetings[i]}
        </motion.span>
      </AnimatePresence>
    </h1>
  );
}

function Stats() {
  const { t } = useTranslation('landing');
  const fmt = useLangFormat();
  const q = useQuery({ queryKey: qk.public.stats, queryFn: ({ signal }) => api.publicStats(signal) });
  if (q.isPending)
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        <StatSkeleton />
        <StatSkeleton />
        <StatSkeleton />
      </div>
    );
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} compact />;
  const s = q.data;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <KPIStat label={t('stats.total')} value={s.total} />
      <KPIStat label={t('stats.resolved')} value={s.resolution_rate_pct} decimals={1} suffix="%" />
      <KPIStat
        label={t('stats.avg_hours')}
        value={s.avg_resolution_hours}
        format={(n) => fmt.duration(n * 60)}
      />
    </div>
  );
}

const PORTALS = [
  { key: 'citizen', to: '/app', icon: UserRound },
  { key: 'officer', to: '/officer', icon: Building2 },
  { key: 'admin', to: '/admin', icon: Landmark },
  { key: 'public', to: '/public', icon: Globe2 },
] as const;

export default function Landing() {
  useSurfaceTheme('ink');
  const { t } = useTranslation('landing');
  const { t: tc } = useTranslation('common');
  return (
    <SmoothScroll>
      <PageTransition className="min-h-dvh">
        <header className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-4">
          <Logo />
          <nav className="flex items-center gap-1" aria-label={tc('nav.main_menu')}>
            <LanguageSwitcher />
            <ThemeToggle />
            <Button asChild variant="outline" size="sm" className="touch-target">
              <Link to="/login">{tc('nav.login')}</Link>
            </Button>
          </nav>
        </header>

        <main id="main">
          <section className="relative overflow-hidden">
            {/* Static gradient poster — the reduced-motion / no-WebGL fallback for the 3D hero. */}
            <div
              className="pointer-events-none absolute inset-0 -z-10 opacity-80"
              style={{
                background:
                  'radial-gradient(60% 50% at 70% 30%, color-mix(in oklab, var(--primary) 28%, transparent), transparent 70%), radial-gradient(50% 40% at 20% 70%, color-mix(in oklab, var(--accent) 22%, transparent), transparent 70%)',
              }}
              data-testid="hero-fallback"
              aria-hidden
            />
            <div className="mx-auto max-w-6xl px-4 pt-12 pb-20 md:pt-24 md:pb-32">
              <p className="text-signal mb-4 font-mono text-xs tracking-widest uppercase">
                {t('hero.eyebrow')}
              </p>
              <CyclingGreeting />
              <p className="text-muted-foreground mt-6 max-w-2xl text-lg">{t('hero.subhead')}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg" className="touch-target shadow-glow-primary rounded-full px-6">
                  <Link to="/app/report?mode=voice" data-testid="cta-voice">
                    <Mic className="size-5" aria-hidden />
                    {t('hero.cta_voice')}
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="touch-target rounded-full px-6">
                  <Link to="/track">
                    <Search className="size-5" aria-hidden />
                    {t('hero.cta_track')}
                  </Link>
                </Button>
              </div>
            </div>
          </section>

          <motion.section {...reveal} className="mx-auto max-w-6xl px-4 py-12">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-2xl font-semibold">{t('stats.title')}</h2>
              <LiveIndicator />
            </div>
            <Stats />
          </motion.section>

          <motion.section {...reveal} className="mx-auto max-w-6xl px-4 py-12">
            <h2 className="font-display mb-4 text-2xl font-semibold">{t('portals.title')}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {PORTALS.map(({ key, to, icon: Icon }) => (
                <Link
                  key={key}
                  to={to}
                  className="group bg-surface hover:border-primary/50 rounded-[var(--radius-xl)] border p-5 transition-colors"
                >
                  <Icon className="text-primary size-7" aria-hidden />
                  <p className="font-display mt-4 text-lg font-semibold">{t(`portals.${key}`)}</p>
                  <p className="text-muted-foreground text-sm">{t(`portals.${key}_desc`)}</p>
                  <ArrowRight
                    className="rtl-flip text-muted-foreground group-hover:text-primary mt-4 size-5 transition-colors"
                    aria-hidden
                  />
                </Link>
              ))}
            </div>
          </motion.section>
        </main>

        <footer className="text-muted-foreground mx-auto max-w-6xl space-y-4 border-t px-4 py-10 text-sm">
          <LanguageSwitcher variant="inline" />
          <p>{t('footer.stack')} · React · FastAPI · Supabase · Gemini · Groq · OpenStreetMap</p>
          <p>{t('footer.disclaimer')}</p>
        </footer>
      </PageTransition>
    </SmoothScroll>
  );
}
