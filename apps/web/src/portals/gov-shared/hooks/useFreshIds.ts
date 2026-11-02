// Ids that appeared since the last refetch of the same view, held briefly so new items can glow.
import { useEffect, useRef, useState } from 'react';

const FRESH_MS = 4000;

export function useFreshIds(ids: string[], viewKey: string, settled: boolean) {
  const seen = useRef<{ key: string; ids: Set<string> } | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const joined = ids.join('|');
  useEffect(() => {
    // Skip loading and placeholder frames: only two real results of one view can reveal an arrival.
    if (!settled) return;
    const current = new Set(joined ? joined.split('|') : []);
    const prev = seen.current;
    seen.current = { key: viewKey, ids: current };
    if (!prev || prev.key !== viewKey) return;
    const arrived = [...current].filter((id) => !prev.ids.has(id));
    if (arrived.length === 0) return;
    setFresh(new Set(arrived));
    const timer = window.setTimeout(() => setFresh(new Set()), FRESH_MS);
    return () => window.clearTimeout(timer);
  }, [joined, viewKey, settled]);
  return fresh;
}
