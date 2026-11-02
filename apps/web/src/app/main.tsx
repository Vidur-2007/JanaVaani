import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/design/tokens.css';
import { initI18n } from '@/lib/i18n';
import '@/lib/pwa/install'; // captures `beforeinstallprompt` before React mounts
import { Providers } from './providers';
import { AppRouter } from './routes';

initI18n();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Providers>
      <AppRouter />
    </Providers>
  </StrictMode>,
);
