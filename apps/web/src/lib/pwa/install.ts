// PWA install prompt (Spec A §5.17). Chromium fires `beforeinstallprompt` once, possibly before React mounts, so the
// event is captured at module load (imported from main.tsx) and exposed through useInstallPrompt().
// iOS Safari has no prompt: `ios` tells the UI to show "Share → Add to Home Screen" instead.
import { useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallState {
  /** A native install prompt is available right now. */
  canInstall: boolean;
  /** Running as an installed app (standalone display mode). */
  installed: boolean;
  /** iOS Safari, not installed: show the manual "Add to Home Screen" hint. */
  ios: boolean;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => {
  snapshot = compute();
  listeners.forEach((l) => l());
};

const standalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true);
const isIos = () =>
  typeof navigator !== 'undefined' &&
  /iphone|ipad|ipod/i.test(navigator.userAgent) &&
  !/crios|fxios|edgios/i.test(navigator.userAgent);

const compute = (): InstallState => {
  const installed = standalone();
  return { canInstall: !!deferred && !installed, installed, ios: !installed && !deferred && isIos() };
};
let snapshot: InstallState = compute();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // We show our own button instead of the mini-infobar.
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    emit();
  });
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', emit);
}

/** Shows the browser's install dialog. Resolves to the user's choice ('unavailable' if there is no prompt). */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const ev = deferred;
  if (!ev) return 'unavailable';
  deferred = null; // A prompt event can only be used once.
  await ev.prompt();
  const { outcome } = await ev.userChoice;
  emit();
  return outcome;
}

export function useInstallPrompt(): InstallState & { promptInstall: typeof promptInstall } {
  const state = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snapshot,
    () => snapshot,
  );
  return { ...state, promptInstall };
}
