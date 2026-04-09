// frontend/lib/useDebouncedValue.ts
import { useEffect, useState } from "react";

export const useDebouncedValue = <T,>(value: T, delayMs: number): T => {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), Math.max(0, delayMs));
    return () => window.clearTimeout(handle);
  }, [delayMs, value]);

  return debounced;
};

