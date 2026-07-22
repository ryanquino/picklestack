import { useEffect, useRef, useState, useCallback } from 'react';

interface StaleWhileRevalidateState<T> {
  data: T | null;
  isStale: boolean;
  isLoading: boolean;
  error: Error | null;
}

interface UseStaleWhileRevalidateOptions<T> {
  fetchFn: () => Promise<T | null>;
  initialData?: T | null;
  revalidateInterval?: number;
  backgroundInterval?: number;
  onError?: (error: Error) => void;
}

/**
 * Hook implementing stale-while-revalidate pattern.
 * Returns cached data immediately, fetches fresh in background.
 * Shows stale data while fetching, updates seamlessly on success.
 */
export function useStaleWhileRevalidate<T>({
  fetchFn,
  initialData = null,
  revalidateInterval = 5000,
  backgroundInterval = 30000,
  onError,
}: UseStaleWhileRevalidateOptions<T>): StaleWhileRevalidateState<T> & { refresh: () => void } {
  const [state, setState] = useState<StaleWhileRevalidateState<T>>({
    data: initialData,
    isStale: false,
    isLoading: initialData === null,
    error: null,
  });

  const fetchFnRef = useRef(fetchFn);
  fetchFnRef.current = fetchFn;

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const isMountedRef = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const isBackgroundRef = useRef(false);

  const refresh = useCallback(async () => {
    if (isBackgroundRef.current) return;
    isBackgroundRef.current = true;

    try {
      const freshData = await fetchFnRef.current();
      if (!isMountedRef.current) return;

      if (freshData !== null) {
        setState(prev => ({
          ...prev,
          data: freshData,
          isStale: false,
          isLoading: false,
          error: null,
        }));
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      const error = err instanceof Error ? err : new Error('Fetch failed');
      onErrorRef.current?.(error);
      setState(prev => ({
        ...prev,
        isStale: true,
        isLoading: false,
        error,
      }));
    } finally {
      isBackgroundRef.current = false;
    }
  }, []);

  const startPolling = useCallback((ms: number) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(refresh, ms);
  }, [refresh]);

  useEffect(() => {
    isMountedRef.current = true;

    if (initialData === null) {
      refresh();
    } else {
      startPolling(revalidateInterval);
    }

    const onVisibility = () => {
      if (document.hidden) {
        startPolling(backgroundInterval);
      } else {
        startPolling(revalidateInterval);
        if (!isBackgroundRef.current) {
          refresh();
        }
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [revalidateInterval, backgroundInterval, initialData, refresh, startPolling]);

  return {
    ...state,
    refresh,
  };
}