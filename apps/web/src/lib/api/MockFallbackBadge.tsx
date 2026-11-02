// Dev/demo badge: shows the API mode and, in hybrid mode, how many calls fell back to mocks.
import { useState } from 'react';
import { API_MODE, DEMO_MODE, useMockFallbacks } from './client';

export function MockFallbackBadge() {
  const { count, paths } = useMockFallbacks();
  const [open, setOpen] = useState(false);
  if (!import.meta.env.DEV && !DEMO_MODE) return null;
  if (API_MODE === 'live') return null;
  const label = API_MODE === 'mock' ? 'MOCK' : `HYBRID · ${count} fallback${count === 1 ? '' : 's'}`;
  return (
    <div className="fixed end-3 bottom-20 z-50 md:bottom-4" data-testid="mock-badge">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="glass text-muted-foreground h-8 rounded-full px-3 font-mono text-[11px] tracking-wide"
        aria-expanded={open}
      >
        {label}
      </button>
      {open && count > 0 && (
        <ul className="glass absolute end-0 bottom-10 max-h-60 w-72 overflow-auto rounded-xl p-2 font-mono text-[11px]">
          {Object.entries(paths).map(([p, n]) => (
            <li key={p} className="flex justify-between gap-2 py-0.5">
              <span className="truncate">{p}</span>
              <span>{n}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
