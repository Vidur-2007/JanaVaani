import { startTransition, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/design/tokens.css';
import { initI18n } from '@/lib/i18n';
import '@/lib/pwa/install'; // captures `beforeinstallprompt` before React mounts
import { Providers } from './providers';
import { releaseBootShell } from './boot';
import { preloadRoute } from './preload';
import { AppRouter } from './routes';

const i18nReady = initI18n();

function mount() {
  releaseBootShell();
  const root = createRoot(document.getElementById('root')!);
  // P6: a transition render is time-sliced (yields to the browser every few ms) instead of one long task, which
  // keeps the main thread responsive on mid-range phones. The boot shell covers the page until it's done.
  startTransition(() => {
    root.render(
      <StrictMode>
        <Providers>
          <AppRouter />
        </Providers>
      </StrictMode>,
    );
  });
}

// P6: fetch this route's chunks + translations in parallel with React booting (no sequential lazy waterfall).
// The static boot shell from index.html stays on screen until the real page has rendered (see boot.ts).
void i18nReady.catch(() => undefined);
void preloadRoute(window.location.pathname);
mount();
