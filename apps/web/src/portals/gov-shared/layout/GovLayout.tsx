// PLACEHOLDER gov shell created by Laptop A in P0 — Laptop C owns and replaces this (Spec C §3).
import { Suspense } from 'react';
import { Link, NavLink, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LogOut } from 'lucide-react';
import { AnimatedOutlet } from '@/app/AnimatedOutlet';
import { Button } from '@/design/ui/button';
import { LanguageSwitcher, LiveIndicator, Logo, PageSkeleton, ThemeToggle } from '@/design/components';
import { useAuth } from '@/lib/auth/useAuth';
import { useSurfaceTheme } from '@/lib/prefs/store';
import { cn } from '@/lib/utils';
import type { Role } from '@contracts/types';

const NAV: { to: string; labelKey: string; roles: Role[]; end?: boolean }[] = [
  { to: '/officer', labelKey: 'nav.officer', roles: ['officer', 'supervisor', 'admin'], end: true },
  { to: '/supervisor', labelKey: 'nav.supervisor', roles: ['supervisor', 'admin'] },
  { to: '/admin', labelKey: 'nav.admin', roles: ['supervisor', 'admin'] },
  { to: '/public', labelKey: 'nav.public', roles: ['officer', 'supervisor', 'admin'] },
];

export function GovLayout() {
  useSurfaceTheme('ink');
  const { t } = useTranslation('common');
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="min-h-dvh md:flex">
      <aside className="bg-surface flex shrink-0 flex-col gap-2 border-b p-3 md:sticky md:top-0 md:h-dvh md:w-60 md:border-e md:border-b-0">
        <div className="flex items-center justify-between">
          <Link to="/">
            <Logo />
          </Link>
          <ThemeToggle />
        </div>
        {profile && (
          <p className="text-muted-foreground px-1 text-xs">
            {profile.name} · {t(`roles.${profile.role}`)}
          </p>
        )}
        <nav className="flex gap-1 overflow-x-auto md:flex-col" aria-label={t('nav.main_menu')}>
          {NAV.filter((n) => profile && n.roles.includes(profile.role)).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cn(
                  'touch-target flex items-center rounded-lg px-3 text-sm whitespace-nowrap',
                  isActive ? 'bg-primary/15 text-primary' : 'hover:bg-surface-2',
                )
              }
            >
              {t(n.labelKey)}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto hidden flex-col gap-2 md:flex">
          <LiveIndicator />
          <LanguageSwitcher />
          <Button
            variant="ghost"
            size="sm"
            className="touch-target justify-start"
            onClick={async () => {
              await signOut();
              navigate('/login');
            }}
          >
            <LogOut className="rtl-flip size-4" aria-hidden />
            {t('auth.sign_out')}
          </Button>
        </div>
      </aside>
      <main id="main" className="min-w-0 flex-1 p-4 md:p-8">
        <Suspense fallback={<PageSkeleton />}>
          <AnimatedOutlet />
        </Suspense>
      </main>
    </div>
  );
}
