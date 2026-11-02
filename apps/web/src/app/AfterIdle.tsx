// P6: render non-critical chrome (demo switcher, toaster) only once the browser is idle after first load,
// so their code (Radix menu + floating-ui, sonner) stays off the critical path.
import { useEffect, useState, type ReactNode } from 'react';

type IdleWindow = Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };

export function AfterIdle({ children, timeout = 2500 }: { children: ReactNode; timeout?: number }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const w = window as IdleWindow;
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setReady(true), { timeout });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(() => setReady(true), 300);
    return () => window.clearTimeout(t);
  }, [timeout]);
  return ready ? <>{children}</> : null;
}
