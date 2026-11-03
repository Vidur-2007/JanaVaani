// Gov sidebar: collapsible to icons on desktop; the same body renders inside the mobile bottom sheet.
import { NavLink, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Button } from '@/design/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/design/ui/tooltip';
import { LanguageSwitcher, LiveIndicator, Logo, ThemeToggle } from '@/design/components';
import { DEMO_MODE } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/useAuth';
import { cn } from '@/lib/utils';
import { navForRole, type NavItem } from './nav';

/** Gov UI language set (Spec C §9; Urdu arrives with P5). */
export const GOV_LANGS = ['en', 'te', 'hi'] as ['en', 'te', 'hi'];

function NavEntry({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const { t } = useTranslation('gov');
  const Icon = item.icon;
  const link = (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      aria-label={collapsed ? t(item.labelKey) : undefined}
      className={({ isActive }) =>
        cn(
          'group relative flex min-h-11 items-center gap-3 rounded-[var(--radius-sm)] px-3 text-sm transition-colors md:min-h-10',
          collapsed && 'justify-center px-0',
          isActive
            ? 'bg-primary/12 text-primary font-medium'
            : 'text-muted-foreground hover:bg-surface-2 hover:text-text',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span className="bg-primary absolute inset-y-2 start-0 w-0.5 rounded-full" aria-hidden />
          )}
          <Icon className="size-[18px] shrink-0" aria-hidden />
          {!collapsed && <span className="truncate">{t(item.labelKey)}</span>}
        </>
      )}
    </NavLink>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{t(item.labelKey)}</TooltipContent>
    </Tooltip>
  );
}

export interface SidebarBodyProps {
  collapsed?: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
}

export function SidebarBody({ collapsed = false, onToggle, onNavigate }: SidebarBodyProps) {
  const { t } = useTranslation('gov');
  const { t: tc } = useTranslation('common');
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const groups = navForRole(profile?.role);
  const scope = profile?.department_id
    ? tc(`departments.${profile.department_id}`)
    : t('shell.all_departments');
  return (
    <div className={cn('flex h-full min-h-0 flex-col gap-3 p-3', onToggle && DEMO_MODE && 'pb-16')}>
      <div className={cn('flex items-center gap-2', collapsed ? 'flex-col' : 'justify-between')}>
        <Logo showName={!collapsed} />
        {onToggle && (
          <Button
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11 md:min-h-9 md:min-w-9"
            onClick={onToggle}
            aria-expanded={!collapsed}
            aria-label={collapsed ? t('shell.expand') : t('shell.collapse')}
          >
            {collapsed ? (
              <PanelLeftOpen className="rtl-flip size-[18px]" aria-hidden />
            ) : (
              <PanelLeftClose className="rtl-flip size-[18px]" aria-hidden />
            )}
          </Button>
        )}
      </div>

      {!collapsed && profile && (
        <div className="bg-surface-2/60 rounded-[var(--radius-md)] border px-3 py-2">
          <p className="truncate text-sm font-medium">{profile.name}</p>
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <span className="text-primary font-medium">{tc(`roles.${profile.role}`)}</span>
            <span aria-hidden>·</span>
            <span className="truncate">{scope}</span>
          </p>
        </div>
      )}

      <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto" aria-label={tc('nav.main_menu')}>
        {groups.map((g) => (
          <div key={g.labelKey} className="space-y-0.5">
            {!collapsed && (
              <p className="text-muted-foreground px-3 pb-1 text-[11px] font-medium tracking-wider uppercase">
                {t(g.labelKey)}
              </p>
            )}
            {g.items.map((item) => (
              <NavEntry key={item.to} item={item} collapsed={collapsed} onNavigate={onNavigate} />
            ))}
          </div>
        ))}
      </nav>

      <div className={cn('flex flex-col gap-1 border-t pt-3', collapsed && 'items-center')}>
        <LiveIndicator className={cn('min-h-8', !collapsed && 'px-3')} label={collapsed ? '' : undefined} />
        <div className={cn('flex items-center gap-1', collapsed && 'flex-col')}>
          <ThemeToggle />
          <LanguageSwitcher langs={GOV_LANGS} />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className={cn('touch-target text-muted-foreground', collapsed ? 'px-0' : 'justify-start')}
          aria-label={tc('auth.sign_out')}
          onClick={async () => {
            await signOut();
            navigate('/login');
          }}
        >
          <LogOut className="rtl-flip size-4" aria-hidden />
          {!collapsed && tc('auth.sign_out')}
        </Button>
      </div>
    </div>
  );
}
