// Gov shell (Spec C §3): collapsible sidebar, mobile bottom-sheet nav, top bar, command palette.
import { Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatedOutlet } from '@/app/AnimatedOutlet';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/design/ui/sheet';
import { PageSkeleton } from '@/design/components';
import { useSurfaceTheme } from '@/lib/prefs/store';
import { cn } from '@/lib/utils';
import '../mocks';
import { CommandPalette } from './CommandPalette';
import { SidebarBody } from './Sidebar';
import { TopBar } from './TopBar';

const COLLAPSE_KEY = 'jv.gov.sidebar_collapsed';

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

export function GovLayout() {
  useSurfaceTheme('ink');
  const { t } = useTranslation('gov');
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        // Preference just won't persist.
      }
      return !c;
    });

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside
        className={cn(
          'bg-surface hidden shrink-0 border-e transition-[width] duration-250 ease-out md:block',
          collapsed ? 'w-[68px]' : 'w-60',
        )}
      >
        <SidebarBody collapsed={collapsed} onToggle={toggle} />
      </aside>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="bottom" className="h-[85dvh] rounded-t-[var(--radius-xl)] p-0">
          <SheetTitle className="sr-only">{t('shell.open_menu')}</SheetTitle>
          <SheetDescription className="sr-only">{t('shell.menu_description')}</SheetDescription>
          <SidebarBody onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onSearch={() => setPaletteOpen(true)} onMenu={() => setMenuOpen(true)} />
        <main id="main" className="min-w-0 flex-1 overflow-y-auto p-3 md:p-6">
          <Suspense fallback={<PageSkeleton />}>
            <AnimatedOutlet />
          </Suspense>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
