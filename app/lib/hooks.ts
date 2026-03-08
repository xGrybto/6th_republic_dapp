import { useEffect } from 'react';

/**
 * Automatically clears an error message after a given delay (default: 10s).
 * Call once per error state at the top of the component.
 */
export function useAutoDismiss(
  error: string | null,
  setError: (v: string | null) => void,
  delayMs = 10000,
) {
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), delayMs);
    return () => clearTimeout(timer);
  }, [error, setError, delayMs]);
}
