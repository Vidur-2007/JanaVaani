// Landing (Spec A §5.1): hero (City Pulse), how it works, live stats, languages showcase, trust, portals, footer.
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Mic } from 'lucide-react';
import { Button } from '@/design/ui/button';
import { LanguageSwitcher, Logo, PageTransition, ThemeToggle } from '@/design/components';
import { useReducedMotion, useSurfaceTheme } from '@/lib/prefs/store';
import { cn } from '@/lib/utils';
import { SmoothScroll } from '@/app/providers';
import { Hero, isMobileViewport } from './Hero';
import { HowItWorks } from './HowItWorks';
import { LiveStats } from './LiveStats';
import { LanguagesShowcase } from './LanguagesShowcase';
import { Trust } from './Trust';
import { Portals } from './Portals';

const STACK = [
  'React',
  'Vite',
  'Tailwind',
  'three.js',
  'FastAPI',
  'Supabase',
  'Gemini',
  'Groq',
  'sentence-transformers',
  'OpenStreetMap',
];

function Header() {
  const { t } = useTranslation('common');
  return (
    <header className="glass sticky top-0 z-40 border-x-0 border-t-0">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4">
        <Link to="/">
          <Logo />
          <span className="sr-only">{t('nav.home')}</span>
        </Link>
        <nav className="flex items-center gap-0 sm:gap-1" aria-label={t('nav.main_menu')}>
          <Button asChild variant="ghost" size="sm" className="touch-target hidden md:inline-flex">
            <Link to="/public">{t('nav.public')}</Link>
          </Button>
          <LanguageSwitcher />
          <ThemeToggle />
          <Button asChild variant="outline" size="sm" className="touch-target max-sm:px-2">
            <Link to="/login">{t('nav.login')}</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  const { t } = useTranslation('landing');
  return (
    <footer className="border-t">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Logo />
          <LanguageSwitcher variant="inline" />
        </div>
        <div>
          <p className="text-muted-foreground mb-2 text-xs font-medium">{t('footer.stack')}</p>
          <ul className="flex flex-wrap gap-2">
            {STACK.map((s) => (
              <li key={s} className="bg-surface-2 rounded-full px-3 py-1 font-mono text-xs">
                {s}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-muted-foreground text-sm">{t('footer.disclaimer')}</p>
        <p className="text-muted-foreground text-xs">
          {t('footer.event')} · {/* i18n-ignore: map data credit (proper noun) */}© OpenStreetMap contributors
        </p>
      </div>
    </footer>
  );
}

/** Mobile sticky CTA bar (Spec A §5.1): appears once the hero's own CTA has scrolled away. */
function StickyCta() {
  const { t } = useTranslation('landing');
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > window.innerHeight * 0.6);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <div
      className={cn(
        'glass fixed inset-x-0 bottom-0 z-30 border-x-0 border-b-0 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-transform duration-300 md:hidden',
        show ? 'translate-y-0' : 'translate-y-full',
      )}
      aria-hidden={!show}
      inert={!show}
    >
      <Button asChild className="touch-target h-12 w-full rounded-full text-base">
        <Link to="/app/report?mode=voice">
          <Mic className="size-5" aria-hidden />
          {t('hero.cta_voice')}
        </Link>
      </Button>
    </div>
  );
}

export default function Landing() {
  useSurfaceTheme('ink');
  const reduced = useReducedMotion();
  const [mobile] = useState(isMobileViewport);
  return (
    <SmoothScroll>
      <PageTransition className="min-h-dvh pb-20 md:pb-0">
        <Header />
        <main id="main">
          <Hero />
          <HowItWorks pinned={!mobile && !reduced} />
          <LiveStats />
          <LanguagesShowcase />
          <Trust />
          <Portals />
        </main>
        <Footer />
      </PageTransition>
      {/* Outside PageTransition: its filter/transform would turn `fixed` into page-relative positioning. */}
      <StickyCta />
    </SmoothScroll>
  );
}
