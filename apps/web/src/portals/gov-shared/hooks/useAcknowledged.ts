// Alert acknowledgement. No endpoint exists (Spec C §6.6 allows client state), so it stays in this browser.
import { useCallback, useState } from 'react';

const KEY = 'jv.gov.acknowledged_alerts';

function read(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function useAcknowledged() {
  const [ids, setIds] = useState<string[]>(read);
  const acknowledge = useCallback((id: string) => {
    setIds((prev) => {
      const next = [...new Set([...prev, id])];
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // Still acknowledged for this session.
      }
      return next;
    });
  }, []);
  return { acknowledged: ids, acknowledge };
}
