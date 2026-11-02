// "Install JanaVaani" (Spec A §5.17): native prompt where supported (Chromium), an "Add to Home Screen" hint on iOS,
// and an "installed" state. `InstallCard` is the dismissible home-screen variant; `InstallRow` lives in Settings.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Download, Share, Smartphone, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/design/ui/button';
import { useInstallPrompt } from '@/lib/pwa/install';

const DISMISS_KEY = 'jv.installDismissed';

function useInstallAction() {
  const { t } = useTranslation('citizen');
  const pwa = useInstallPrompt();
  const install = async () => {
    const r = await pwa.promptInstall();
    if (r === 'accepted') toast.success(t('install.done'));
  };
  return { ...pwa, install };
}

export function InstallRow() {
  const { t } = useTranslation('citizen');
  const { canInstall, installed, ios, install } = useInstallAction();
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3" data-testid="install-row">
      <Smartphone className="text-muted-foreground size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{t('install.title')}</p>
        <p className="text-muted-foreground text-sm">
          {installed
            ? t('install.installed')
            : canInstall
              ? t('install.body')
              : ios
                ? t('install.ios')
                : t('install.unavailable')}
        </p>
      </div>
      {installed ? (
        <CheckCircle2 className="text-success size-5" aria-label={t('install.installed')} />
      ) : (
        canInstall && (
          <Button className="touch-target" onClick={install} data-testid="install-app">
            <Download className="size-4" aria-hidden />
            {t('install.button')}
          </Button>
        )
      )}
    </div>
  );
}

/** Home: shown only when the app can actually be installed (or on iOS), until dismissed. */
export function InstallCard() {
  const { t } = useTranslation('citizen');
  const { canInstall, ios, install } = useInstallAction();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  if (dismissed || !(canInstall || ios)) return null;
  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* private mode: dismissed for this visit only */
    }
  };
  return (
    <section
      className="bg-surface flex items-center gap-3 rounded-[var(--radius-lg)] border p-4"
      aria-labelledby="install-card-title"
      data-testid="install-card"
    >
      <span className="bg-primary/12 text-primary grid size-11 shrink-0 place-items-center rounded-xl">
        {ios ? <Share className="size-5" aria-hidden /> : <Download className="size-5" aria-hidden />}
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="install-card-title" className="font-semibold">
          {t('install.title')}
        </h2>
        <p className="text-muted-foreground text-sm">{ios ? t('install.ios') : t('install.body')}</p>
      </div>
      {canInstall && (
        <Button className="touch-target" onClick={install} data-testid="install-app-home">
          {t('install.button')}
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="touch-target shrink-0"
        onClick={dismiss}
        aria-label={t('install.dismiss')}
      >
        <X className="size-4" aria-hidden />
      </Button>
    </section>
  );
}
