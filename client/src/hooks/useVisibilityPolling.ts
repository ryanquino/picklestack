import { useEffect, useRef } from 'react';

/**
 * Sets up a polling interval that slows down when the tab is hidden.
 * Normal interval when visible, background interval when hidden.
 */
export function useVisibilityPolling(
  callback: () => void,
  normalMs: number,
  backgroundMs: number
) {
  const savedCallback = useRef(callback);
  savedCallback.current = callback;

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;

    const poll = () => savedCallback.current();

    const start = (ms: number) => {
      clearInterval(timer);
      timer = setInterval(poll, ms);
    };

    start(normalMs);

    const onVisibility = () => {
      if (document.hidden) {
        start(backgroundMs);
      } else {
        start(normalMs);
        poll(); // immediate refresh when becoming visible
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [normalMs, backgroundMs]);
}
