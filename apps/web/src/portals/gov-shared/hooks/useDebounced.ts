import { useEffect, useState } from 'react';

export function useDebounced<T>(value: T, ms: number): T {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setShown(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return shown;
}
