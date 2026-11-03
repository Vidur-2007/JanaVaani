import { useSyncExternalStore } from 'react';

const query = '(max-width: 767.98px)';

/** Below the md breakpoint, where gov tables become cards (master §11). */
export function useIsMobile() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
  );
}
