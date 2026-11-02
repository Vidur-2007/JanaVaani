// P6/P7: non-critical chrome (demo switcher, toaster) loads after the browser is idle, so its code (Radix menu +
// floating-ui, sonner) stays off the critical path. A failed load (offline, flaky network) renders nothing and
// retries when the device comes back online — optional chrome must never take a page down.
import { Component, useEffect, useState, type ComponentType, type ReactNode } from 'react';

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

function whenIdle(cb: () => void, timeout: number): () => void {
  const w = window as IdleWindow;
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(cb, { timeout });
    return () => w.cancelIdleCallback?.(id);
  }
  const t = window.setTimeout(cb, 300);
  return () => window.clearTimeout(t);
}

export function AfterIdle({ children, timeout = 2500 }: { children: ReactNode; timeout?: number }) {
  const [ready, setReady] = useState(false);
  useEffect(() => whenIdle(() => setReady(true), timeout), [timeout]);
  return ready ? <>{children}</> : null;
}

/**
 * Load `loader` after idle and render its component with `props`. Unlike React.lazy (which caches a failed
 * import forever), a failure is retried on the next `online` event.
 */
export function IdleImport<P extends object>({
  loader,
  props,
  timeout = 2500,
}: {
  loader: () => Promise<ComponentType<P>>;
  props: P;
  timeout?: number;
}) {
  const [Comp, setComp] = useState<ComponentType<P> | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      loader()
        .then((c) => alive && setComp(() => c))
        .catch(() => window.addEventListener('online', load, { once: true }));
    const cancel = whenIdle(load, timeout);
    return () => {
      alive = false;
      cancel();
      window.removeEventListener('online', load);
    };
    // The loader is a stable module-level function at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeout]);
  return Comp ? (
    <OptionalChunk>
      <Comp {...props} />
    </OptionalChunk>
  ) : null;
}

/** Last line of defence: an optional widget that throws renders nothing instead of the page error screen. */
export class OptionalChunk extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
