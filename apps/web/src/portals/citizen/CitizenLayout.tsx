// Citizen shell: Paper theme by default; bottom nav on mobile, side rail on desktop (master §11).
import { Suspense } from 'react';
import { Link, NavLink } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Bell, FileText, Home, Mic, Settings } from 'lucide-react';
import { AnimatedOutlet } from '@/app/AnimatedOutlet';
import { LanguageSwitcher, Logo, PageSkeleton, ThemeToggle } from '@/design/components';
import { api, qk } from '@/lib/api/endpoints';
import { useAuth } from '@/lib/auth/useAuth';
import { useSurfaceTheme } from '@/lib/prefs/store';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/app', key: 'home', icon: Home, end: true },
  { to: '/app/report', key: 'report', icon: Mic, end: false },
  { to: '/app/complaints', key: 'complaints', icon: FileText, end: false },
  { to: '/app/notifications', key: 'alerts', icon: Bell, end: false },
  { to: '/app/settings', key: 'settings', icon: Settings, end: false },
] as const;

function useUnread() {
  const { status } = useAuth();
  const q = useQuery({
    queryKey: qk.notifications.list(),
    queryFn: ({ signal }) => api.notifications({}, signal),
    enabled: status === 'authenticated',
  });
  return q.data?.items.filter((n) => !n.read).length ?? 0;
}

function TopBar() {
  const { t } = useTranslation('common');
  return (
    <header className="bg-bg/80 sticky top-0 z-40 border-b backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4">
        <Link to="/app" aria-label={t('nav.home')}>
          <Logo />
        </Link>
        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

export function CitizenLayout() {
  useSurfaceTheme('paper');
  const { t } = useTranslation('common');
  const unread = useUnread();
  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="bg-primary text-primary-foreground sr-only z-50 rounded px-3 py-2 focus:not-sr-only focus:fixed focus:start-2 focus:top-2"
      >
        {t('nav.skip_to_content')}
      </a>
      <TopBar />
      <div className="mx-auto flex max-w-6xl">
        {/* Side rail (desktop) */}
        <nav
          className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-56 shrink-0 flex-col gap-1 border-e p-3 md:flex"
          aria-label={t('nav.main_menu')}
        >
          {NAV.map(({ to, key, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'touch-target flex items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
                  isActive ? 'bg-primary/12 text-primary' : 'hover:bg-surface-2',
                )
              }
            >
              <Icon className="size-5" aria-hidden />
              <span className="flex-1">{t(`nav.${key}`)}</span>
              {key === 'alerts' && unread > 0 && (
                <span className="bg-primary text-primary-foreground tabular rounded-full px-1.5 text-xs">
                  {unread}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <main id="main" className="min-w-0 flex-1 px-4 pt-4 pb-28 md:px-8 md:pb-10">
          <Suspense fallback={<PageSkeleton />}>
            <AnimatedOutlet />
          </Suspense>
        </main>
      </div>
      {/* Bottom nav (mobile) */}
      <nav
        className="bg-surface/95 fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
        aria-label={t('nav.main_menu')}
      >
        <ul className="grid grid-cols-5">
          {NAV.map(({ to, key, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium',
                    isActive ? 'text-primary' : 'text-muted-foreground',
                  )
                }
              >
                <Icon className="size-5" aria-hidden />
                <span className="max-w-full truncate px-1">{t(`nav.${key}`)}</span>
                {key === 'alerts' && unread > 0 && (
                  <span
                    className="bg-primary absolute top-2 end-[calc(50%-18px)] size-2 rounded-full"
                    aria-hidden
                  />
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

/** Shell for public citizen pages (login, onboarding, track, guide, QR entry). */
export function PublicCitizenLayout() {
  useSurfaceTheme('paper');
  return (
    <div className="min-h-dvh">
      <TopBarPublic />
      <main id="main" className="mx-auto max-w-3xl px-4 py-6 md:py-10">
        <Suspense fallback={<PageSkeleton />}>
          <AnimatedOutlet />
        </Suspense>
      </main>
    </div>
  );
}

function TopBarPublic() {
  const { t } = useTranslation('common');
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4">
        <Link to="/" aria-label={t('nav.home')}>
          <Logo />
        </Link>
        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
