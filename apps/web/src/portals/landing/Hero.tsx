// Hero: City Pulse 3D canvas (lazy, after first paint) over a static gradient poster, cycling multilingual headline, CTAs.
import { lazy, Suspense, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, Mic, Search } from 'lucide-react';
import { Button } from '@/design/ui/button';
import { easeOutExpo } from '@/design/motion';
import { api, qk } from '@/lib/api/endpoints';
import { useReducedMotion } from '@/lib/prefs/store';

const CityPulse = lazy(() => import('./CityPulse'));

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export const isMobileViewport = () =>
  typeof window !== 'undefined' && window.matchMedia('(max-width: 767px), (pointer: coarse)').matches;

/** True once the page has painted and the browser is idle — the 3D scene never competes with LCP. */
function useAfterFirstPaint(enabled: boolean) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const go = () => {
      const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      if (idle) idle(() => !cancelled && setReady(true), { timeout: 2000 });
      else window.setTimeout(() => !cancelled && setReady(true), 600);
    };
    if (document.readyState === 'complete') go();
    else window.addEventListener('load', go, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener('load', go);
    };
  }, [enabled]);
  return ready;
}

function CyclingHeadline() {
  const { t } = useTranslation('landing');
  const greetings = t('hero.greetings', { returnObjects: true }) as string[];
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setI((x) => (x + 1) % greetings.length), 3200);
    return () => window.clearInterval(id);
  }, [greetings.length]);
  return (
    <h1 className="font-display relative text-4xl leading-[1.15] font-semibold tracking-tight sm:text-6xl md:text-7xl">
      {/* Screen readers get every greeting once; the animation is decorative. */}
      <span className="sr-only">{greetings.join(' ')}</span>
      <span className="grid min-h-[2.4em] items-end sm:min-h-[1.3em]" aria-hidden>
        {/* Lines overlap in one grid cell (crossfade), so a greeting is always on screen. */}
        <AnimatePresence initial={false}>
          <motion.span
            key={i}
            className="col-start-1 row-start-1 block text-balance"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -24, filter: 'blur(10px)' }}
            transition={{ duration: 0.6, ease: easeOutExpo }}
          >
            {greetings[i]}
          </motion.span>
        </AnimatePresence>
      </span>
    </h1>
  );
}

export function Hero() {
  const { t } = useTranslation('landing');
  const reduced = useReducedMotion();
  const [webgl] = useState(() => typeof document !== 'undefined' && hasWebGL());
  const [mobile] = useState(isMobileViewport);
  const ready = useAfterFirstPaint(!reduced && webgl);
  const wards = useQuery({ queryKey: qk.meta.wards, queryFn: ({ signal }) => api.wards(signal), staleTime: Infinity, enabled: ready });
  const map = useQuery({ queryKey: qk.public.map({ days: 90 }), queryFn: ({ signal }) => api.publicMap({ days: 90 }, signal), enabled: ready });
  const show3d = ready && wards.data && map.data;

  return (
    <section className="relative isolate flex min-h-[calc(100dvh-4rem)] items-end overflow-hidden md:items-center" aria-labelledby="hero-title">
      {/* Static poster: always painted first (LCP), and the fallback for reduced motion / no WebGL. */}
      <div
        className="absolute inset-0 -z-20"
        style={{
          background:
            'radial-gradient(55% 45% at 72% 38%, color-mix(in oklab, var(--primary) 30%, transparent), transparent 70%), radial-gradient(45% 40% at 18% 72%, color-mix(in oklab, var(--accent) 24%, transparent), transparent 70%), radial-gradient(40% 35% at 85% 85%, color-mix(in oklab, var(--ai) 20%, transparent), transparent 70%)',
        }}
        data-testid="hero-fallback"
        aria-hidden
      />
      {show3d && (
        <Suspense fallback={null}>
          <motion.div className="absolute inset-0 -z-10" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.2 }}>
            <CityPulse wards={wards.data!} points={map.data!} mobile={mobile} />
          </motion.div>
        </Suspense>
      )}
      {/* Legibility scrim behind the copy. */}
      <div className="from-bg via-bg/70 absolute inset-0 -z-10 bg-gradient-to-t to-transparent md:bg-gradient-to-r rtl:md:bg-gradient-to-l" aria-hidden />

      <div className="mx-auto w-full max-w-6xl px-4 pt-24 pb-16 md:py-24">
        <div className="max-w-2xl">
          <p className="text-signal mb-5 font-mono text-xs tracking-[0.2em] uppercase">{t('hero.eyebrow')}</p>
          <div id="hero-title">
            <CyclingHeadline />
          </div>
          <p className="text-muted-foreground mt-6 max-w-xl text-lg leading-relaxed">{t('hero.subhead')}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="touch-target shadow-glow-primary h-12 rounded-full px-6 text-base">
              <Link to="/app/report?mode=voice" data-testid="cta-voice">
                <Mic className="size-5" aria-hidden />
                {t('hero.cta_voice')}
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="touch-target glass h-12 rounded-full px-6 text-base">
              <Link to="/track" data-testid="cta-track">
                <Search className="size-5" aria-hidden />
                {t('hero.cta_track')}
              </Link>
            </Button>
          </div>
        </div>
      </div>
      <a
        href="#how"
        className="text-muted-foreground hover:text-text absolute bottom-4 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-1 text-xs md:flex"
      >
        {t('hero.scroll_hint')}
        <ChevronDown className="size-4 motion-safe:animate-bounce" aria-hidden />
      </a>
    </section>
  );
}
