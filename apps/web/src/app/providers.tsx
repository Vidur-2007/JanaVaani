// App-wide providers: QueryClient, prefs → <html>, i18n, Auth, live events, toasts, tooltips.
import { Suspense, useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/design/ui/tooltip';
import { PageSkeleton } from '@/design/components/Skeletons';
import { ApiRequestError } from '@/lib/api/client';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { i18n } from '@/lib/i18n';
import { useLiveEvents } from '@/lib/live/useLiveEvents';
import { usePrefsToDocument, useReducedMotion, useTheme } from '@/lib/prefs/store';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Don't retry auth/validation errors; retry network/5xx once.
      retry: (count, error) => !(error instanceof ApiRequestError && error.status < 500) && count < 1,
    },
    mutations: { retry: false },
  },
});

function PrefsSync() {
  usePrefsToDocument();
  return null;
}

function LiveEventsMount() {
  useLiveEvents();
  return null;
}

function ThemedToaster() {
  const theme = useTheme();
  return <Toaster theme={theme === 'ink' ? 'dark' : 'light'} position="top-center" richColors closeButton />;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <PrefsSync />
        <TooltipProvider delayDuration={300}>
          <Suspense fallback={<PageSkeleton />}>
            <AuthProvider>
              <LiveEventsMount />
              {children}
            </AuthProvider>
          </Suspense>
        </TooltipProvider>
        <ThemedToaster />
      </I18nextProvider>
    </QueryClientProvider>
  );
}

/**
 * Lenis smooth scroll — landing only (master §11). Mount inside the landing layout.
 * Disabled under reduced motion.
 */
export function SmoothScroll({ children }: { children?: ReactNode }) {
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    let lenis: { raf: (t: number) => void; destroy: () => void } | null = null;
    let cancelled = false;
    import('lenis').then(({ default: Lenis }) => {
      if (cancelled) return;
      lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
      const loop = (t: number) => {
        lenis!.raf(t);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      lenis?.destroy();
    };
  }, [reduced]);
  return <>{children}</>;
}
