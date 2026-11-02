// Gov top bar: breadcrumb, global search (opens the palette), notifications bell.
import { Link, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Menu, Search } from 'lucide-react';
import { Button } from '@/design/ui/button';
import { navItemForPath } from './nav';
import { NotificationsBell } from './NotificationsBell';

function Breadcrumb() {
  const { t } = useTranslation('gov');
  const { pathname } = useLocation();
  const item = navItemForPath(pathname);
  const caseId = pathname.match(/\/case\/([^/]+)/)?.[1];
  return (
    <nav aria-label={t('shell.breadcrumb')} className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {item && (
          <li className="min-w-0 truncate">
            {caseId ? (
              <Link to={item.to} className="text-muted-foreground hover:text-text">
                {t(item.labelKey)}
              </Link>
            ) : (
              <span aria-current="page" className="font-medium">
                {t(item.labelKey)}
              </span>
            )}
          </li>
        )}
        {caseId && (
          <>
            <ChevronRight className="rtl-flip text-muted-foreground size-3.5 shrink-0" aria-hidden />
            <li aria-current="page" className="truncate font-mono text-xs font-medium">
              {decodeURIComponent(caseId)}
            </li>
          </>
        )}
      </ol>
    </nav>
  );
}

export function TopBar({ onSearch, onMenu }: { onSearch: () => void; onMenu: () => void }) {
  const { t } = useTranslation('gov');
  const mac = /mac/i.test(navigator.platform);
  return (
    <header className="bg-bg/85 sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-3 backdrop-blur md:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="touch-target md:hidden"
        onClick={onMenu}
        aria-label={t('shell.open_menu')}
      >
        <Menu className="size-5" aria-hidden />
      </Button>
      <div className="min-w-0 flex-1">
        <Breadcrumb />
      </div>
      <button
        type="button"
        onClick={onSearch}
        data-testid="global-search"
        aria-label={t('palette.title')}
        aria-keyshortcuts="Control+K Meta+K"
        className="bg-surface hover:bg-surface-2 text-muted-foreground touch-target hidden h-9 w-64 items-center gap-2 rounded-[var(--radius-sm)] border px-3 text-sm transition-colors md:flex lg:w-80"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="flex-1 truncate text-start">{t('palette.search_hint')}</span>
        <kbd className="bg-surface-2 rounded border px-1.5 font-mono text-[11px]">{mac ? '⌘K' : 'Ctrl K'}</kbd>
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="touch-target md:hidden"
        onClick={onSearch}
        aria-label={t('palette.title')}
      >
        <Search className="size-5" aria-hidden />
      </Button>
      <NotificationsBell />
    </header>
  );
}
