// App-wide providers: QueryClient, prefs → <html>, i18n, Auth, live events, toasts, tooltips.
import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { I18nextProvider } from 'react-i18next';
import { TooltipProvider } from '@/design/ui/tooltip';
import { RouteFallback } from '@/design/components/Skeletons';
import { ApiRequestError } from '@/lib/api/client';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { i18n } from '@/lib/i18n';
import { useLiveEvents } from '@/lib/live/useLiveEvents';
import { AfterIdle } from './AfterIdle';
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

// P6: sonner loads after idle (off the critical path). Toasts are only raised by user actions and live events.
const Toaster = lazy(() => import('sonner').then((m) => ({ default: m.Toaster })));

function ThemedToaster() {
  const theme = useTheme();
  return (
    <AfterIdle timeout={1500}>
      <Suspense fallback={null}>
        <Toaster theme={theme === 'ink' ? 'dark' : 'light'} position="top-center" richColors closeButton />
      </Suspense>
    </AfterIdle>
  );
}

/** P7: one switch for every motion component — reduced motion (OS or in-app toggle) drops transforms, keeps fades. */
function MotionPrefs({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  return <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>{children}</MotionConfig>;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionPrefs>
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <PrefsSync />
          <TooltipProvider delayDuration={300}>
            <Suspense fallback={<RouteFallback />}>
              <AuthProvider>
                <LiveEventsMount />
                {children}
              </AuthProvider>
            </Suspense>
          </TooltipProvider>
          <ThemedToaster />
        </I18nextProvider>
      </QueryClientProvider>
    </MotionPrefs>
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
