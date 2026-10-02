/**
 * useDebounce — returns a debounced version of a callback.
 * The callback fires only after `delay` ms have elapsed since the last call.
 */
import { useCallback, useRef } from "react";

export function useDebounce<T extends unknown[]>(
  fn: (...args: T) => void,
  delay: number,
): (...args: T) => void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  return useCallback(
    (...args: T) => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        fn(...args);
        timer.current = null;
      }, delay);
    },
    [fn, delay],
  );
}
