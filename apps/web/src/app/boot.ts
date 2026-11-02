// P6: hand-over from the static boot shell in index.html to React. #root stays hidden (CSS in index.html) while
// #boot exists; we remove #boot once React has rendered real content — i.e. #root has children and no
// route-level Suspense fallback (RouteFallback) is showing — or after a safety cap.
export function releaseBootShell(capMs = 4000) {
  const boot = document.getElementById('boot');
  const root = document.getElementById('root');
  if (!boot || !root) return;
  let done = false;
  const release = () => {
    if (done) return;
    done = true;
    observer.disconnect();
    window.clearTimeout(timer);
    boot.remove();
  };
  // The app stylesheet is injected after first paint (vite.config deferBootAssets); wait until it applies.
  const css = document.querySelector<HTMLLinkElement>('link[data-jv-css]');
  const cssReady = () => !css || (css.media !== 'print' && !!css.sheet);
  const check = () => {
    if (cssReady() && root.childElementCount > 0 && !root.querySelector('[data-route-fallback]')) release();
  };
  css?.addEventListener('load', () => setTimeout(check, 0));
  const observer = new MutationObserver(check);
  observer.observe(root, { childList: true, subtree: true });
  const timer = window.setTimeout(release, capMs);
  check();
}
