// P6 (Android): the hardware/gesture back button closes a full-screen overlay instead of leaving the page
// (and losing the conversation). Pushes a history entry that copies React Router's current state (same key and
// idx), so the router sees no navigation on back; closing the overlay ourselves pops that entry again.
import { useEffect, useRef } from 'react';

const mounted = new Set<string>();

export function useBackToClose(id: string, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    mounted.add(id);
    const base = (window.history.state ?? {}) as Record<string, unknown>;
    if (base.jvOverlay !== id) window.history.pushState({ ...base, jvOverlay: id }, '');
    let poppedByUser = false;
    const onPop = () => {
      if ((window.history.state as Record<string, unknown> | null)?.jvOverlay === id) return;
      poppedByUser = true;
      closeRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      mounted.delete(id);
      if (poppedByUser) return;
      // Closed by a button (or a hand-over): drop our entry so "back" later leaves the page as expected.
      // Deferred, so an immediate re-mount (React StrictMode in dev) keeps the entry instead.
      window.setTimeout(() => {
        if (!mounted.has(id) && (window.history.state as Record<string, unknown> | null)?.jvOverlay === id) window.history.back();
      }, 0);
    };
  }, [id]);
}
