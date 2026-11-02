// Citizen shell (master §11): Paper theme by default; bottom nav on mobile, side rail on desktop,
// page transitions, unread badge, user menu, live-notification toasts, first-run onboarding redirect.
import { Suspense } from 'react';
import { Link, Navigate, NavLink, useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Bell,
  BookOpen,
  FileText,
  Home,
  LogOut,
  MapPinned,
  Mic,
  Search,
  Settings,
  UserRound,
} from 'lucide-react';
import { AnimatedOutlet } from '@/app/AnimatedOutlet';
import { Button } from '@/design/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/design/ui/dropdown-menu';
import { LanguageSwitcher, Logo, RouteFallback, ThemeToggle } from '@/design/components';
import { api, qk } from '@/lib/api/endpoints';
import { useAuth } from '@/lib/auth/useAuth';
import { useLiveEvent } from '@/lib/live/useLiveEvents';
import { usePrefs, useSurfaceTheme } from '@/lib/prefs/store';
import { cn } from '@/lib/utils';
import { useOutboxFlush } from './report/outbox';

const NAV = [
  { to: '/app', key: 'home', icon: Home, end: true },
  { to: '/app/report', key: 'report', icon: Mic, end: false },
  { to: '/app/complaints', key: 'complaints', icon: FileText, end: false },
  { to: '/app/notifications', key: 'alerts', icon: Bell, end: false },
  { to: '/app/settings', key: 'settings', icon: Settings, end: false },
] as const;

const MORE = [
  { to: '/app/nearby', key: 'nearby', icon: MapPinned },
  { to: '/track', key: 'track', icon: Search },
  { to: '/guide', key: 'guide', icon: BookOpen },
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

/** Toast when a new notification arrives (the list itself refreshes via query invalidation). */
function useNotificationToasts() {
  const { t } = useTranslation('citizen');
  const navigate = useNavigate();
  useLiveEvent((e) => {
    if (e.kind !== 'notification') return;
    toast(t('shell.new_update'), {
      action: e.grievance_id
        ? { label: t('shell.view'), onClick: () => navigate(`/app/complaints/${e.grievance_id}`) }
        : undefined,
    });
  });
}

function UserMenu() {
  const { t } = useTranslation('common');
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  if (!profile) return null;
  const initials =
    profile.role === 'guest'
      ? ''
      : profile.name
          .split(' ')
          .map((p) => p[0])
          .slice(0, 2)
          .join('');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="touch-target rounded-full" data-testid="user-menu">
          <span className="sr-only">{profile.name}</span>
          <span
            className="bg-primary/15 text-primary grid size-9 place-items-center rounded-full text-sm font-semibold"
            aria-hidden
          >
            {initials || <UserRound className="size-4" aria-hidden />}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span className="truncate">{profile.role === 'guest' ? t('roles.guest') : profile.name}</span>
          <span className="text-muted-foreground text-xs font-normal">{t(`roles.${profile.role}`)}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="min-h-11" onSelect={() => navigate('/app/settings')}>
          <Settings className="size-4" aria-hidden />
          {t('nav.settings')}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="min-h-11"
          onSelect={async () => {
            await signOut();
            navigate('/');
          }}
        >
          <LogOut className="rtl-flip size-4" aria-hidden />
          {t('auth.sign_out')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TopBar() {
  const { t } = useTranslation('common');
  return (
    <header className="bg-bg/80 sticky top-0 z-40 border-b backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4">
        <Link to="/app">
          <Logo />
          <span className="sr-only">{t('nav.home')}</span>
        </Link>
        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

function UnreadCount({ n, className }: { n: number; className?: string }) {
  const { t } = useTranslation('citizen');
  if (n <= 0) return null;
  return (
    <span
      className={cn(
        'bg-primary text-primary-foreground tabular min-w-5 rounded-full px-1.5 text-center text-[11px] leading-5 font-semibold',
        className,
      )}
    >
      {n > 9 ? '9+' : n}
      <span className="sr-only"> {t('shell.unread', { count: n })}</span>
    </span>
  );
}

export function CitizenLayout() {
  useSurfaceTheme('paper');
  useNotificationToasts();
  useOutboxFlush();
  const { t } = useTranslation('common');
  const unread = useUnread();
  const onboarded = usePrefs((s) => s.onboarded);
  const simple = usePrefs((s) => s.simple_mode);
  const location = useLocation();
  // First run: language → consent → accessibility before the app (Spec A §5.2).
  if (!onboarded)
    return (
      <Navigate to={`/onboarding?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
    );
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
          className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 flex-col gap-1 border-e p-3 md:flex"
          aria-label={t('nav.main_menu')}
        >
          <Button asChild className="touch-target mb-3 h-12 rounded-full text-base">
            <Link to="/app/report">
              <Mic className="size-5" aria-hidden />
              {t('actions.report')}
            </Link>
          </Button>
          {NAV.filter((n) => n.key !== 'report').map(({ to, key, icon: Icon, end }) => (
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
              {key === 'alerts' && <UnreadCount n={unread} />}
            </NavLink>
          ))}
          {!simple && (
            <>
              <div className="bg-border mx-3 my-2 h-px" />
              {MORE.map(({ to, key, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    cn(
                      'touch-target text-muted-foreground flex items-center gap-3 rounded-xl px-3 text-sm transition-colors',
                      isActive ? 'bg-primary/12 text-primary' : 'hover:bg-surface-2 hover:text-text',
                    )
                  }
                >
                  <Icon className="size-5" aria-hidden />
                  {t(`nav.${key}`)}
                </NavLink>
              ))}
            </>
          )}
        </nav>
        <main id="main" className="min-w-0 flex-1 px-4 pt-4 pb-28 md:px-8 md:pt-8 md:pb-12">
          <Suspense fallback={<RouteFallback />}>
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
                {({ isActive }) => (
                  <>
                    {key === 'report' ? (
                      <span className="bg-primary text-primary-foreground -mt-1 grid size-10 place-items-center rounded-full shadow-md">
                        <Icon className="size-5" aria-hidden />
                      </span>
                    ) : (
                      <Icon className="size-5" aria-hidden />
                    )}
                    <span className="max-w-full truncate px-1">{t(`nav.${key}`)}</span>
                    {isActive && key !== 'report' && (
                      <span className="bg-primary absolute top-0 h-0.5 w-8 rounded-full" aria-hidden />
                    )}
                    {key === 'alerts' && (
                      <UnreadCount n={unread} className="absolute top-1.5 start-[calc(50%+2px)]" />
                    )}
                  </>
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
        <Suspense fallback={<RouteFallback />}>
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
        <Link to="/">
          <Logo />
          <span className="sr-only">{t('nav.home')}</span>
        </Link>
        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
