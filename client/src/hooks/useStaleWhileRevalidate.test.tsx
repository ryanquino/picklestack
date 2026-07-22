import { renderHook, act } from '@testing-library/react';
import { useStaleWhileRevalidate } from './useStaleWhileRevalidate';

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('useStaleWhileRevalidate', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    });
  });

  it('shows initial loading when no initial data', async () => {
    let resolveFetch: (value: any) => void;
    const promise = new Promise(resolve => {
      resolveFetch = resolve;
    });

    const fetchFn = () => promise;

    const { result } = renderHook(() => useStaleWhileRevalidate({ fetchFn }));

    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isStale).toBe(false);
    expect(result.current.error).toBeNull();

    act(() => {
      resolveFetch({ id: 1 });
    });

    await promise;

    expect(result.current.data).toEqual({ id: 1 });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isStale).toBe(false);
  });

  it('uses initial data and starts polling', async () => {
    let resolveFetch: (value: any) => void;
    const promise = new Promise(resolve => {
      resolveFetch = resolve;
    });

    const fetchFn = () => promise;
    const initialData = { id: 1 };

    const { result } = renderHook(() => useStaleWhileRevalidate({ fetchFn, initialData }));

    expect(result.current.data).toEqual(initialData);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isStale).toBe(false);

    act(() => {
      resolveFetch({ id: 2 });
    });

    await promise;

    expect(result.current.data).toEqual({ id: 2 });
  });

  it('refreshes data when refresh is called', async () => {
    let resolveFetch1: (value: any) => void;
    const promise1 = new Promise(resolve => {
      resolveFetch1 = resolve;
    });

    let resolveFetch2: (value: any) => void;
    const promise2 = new Promise(resolve => {
      resolveFetch2 = resolve;
    });

    let fetchCount = 0;
    const fetchFn = () => {
      fetchCount++;
      return fetchCount === 1 ? promise1 : promise2;
    };

    const { result } = renderHook(() => useStaleWhileRevalidate({ fetchFn }));

    await act(() => promise1);

    expect(result.current.data).toEqual({ id: 1 });

    act(() => {
      result.current.refresh();
    });

    expect(fetchCount).toBe(2);

    act(() => {
      resolveFetch2({ id: 2 });
    });

    await promise2;

    expect(result.current.data).toEqual({ id: 2 });
  });

  it('shows stale data while loading fresh data', async () => {
    let resolveFetch1: (value: any) => void;
    const promise1 = new Promise(resolve => {
      resolveFetch1 = resolve;
    });

    let resolveFetch2: (value: any) => void;
    const promise2 = new Promise(resolve => {
      resolveFetch2 = resolve;
    });

    let fetchCount = 0;
    const fetchFn = () => {
      fetchCount++;
      return fetchCount === 1 ? promise1 : promise2;
    };

    const initialData = { id: 1 };

    const { result } = renderHook(() => useStaleWhileRevalidate({ fetchFn, initialData }));

    expect(result.current.data).toEqual(initialData);
    expect(result.current.isLoading).toBe(false);

    const PromiseWithThen = new Promise(resolve => {
      resolveFetch2(resolve);
    });

    act(() => {
      setTimeout(() => resolveFetch2({ id: 2 }), 10);
    });

    await delay(20);

    expect(result.current.isLoading).toBe(true);

    act(() => {
      resolveFetch2({ id: 2 });
    });

    await PromiseWithThen;

    expect(result.current.data).toEqual({ id: 2 });
    expect(result.current.isLoading).toBe(false);
  });

  it('handles errors gracefully', async () => {
    const error = new Error('Fetch failed');
    const fetchFn = () => Promise.reject(error);

    const { result } = renderHook(() => useStaleWhileRevalidate({ fetchFn }));

    expect(result.current.error).toBe(error);
    expect(result.current.isStale).toBe(true);
  });

  it('handles error with initial data', async () => {
    const error = new Error('Fetch failed');
    const fetchFn = () => Promise.reject(error);
    const initialData = { id: 1 };

    const { result } = renderHook(() => useStaleWhileRevalidate({ fetchFn, initialData }));

    expect(result.current.data).toEqual(initialData);
    expect(result.current.error).toBe(error);
    expect(result.current.isStale).toBe(true);
  });

  it('revalidates on focus', async () => {
    let resolveFetch1: (value: any) => void;
    const promise1 = new Promise(resolve => {
      resolveFetch1 = resolve;
    });

    let resolveFetch2: (value: any) => void;
    const promise2 = new Promise(resolve => {
      resolveFetch2 = resolve;
    });

    let fetchCount = 0;
    const fetchFn = () => {
      fetchCount++;
      return fetchCount === 1 ? promise1 : promise2;
    };

    const initialData = { id: 1 };

    const { result } = renderHook(() => useStaleWhileRevalidate({ fetchFn, initialData }));

    await act(() => promise1);

    expect(fetchCount).toBe(1);

    act(() => {
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    act(() => {
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => false,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    act(() => {
      resolveFetch2({ id: 2 });
    });

    await promise2;

    expect(fetchCount).toBe(2);
    expect(result.current.data).toEqual({ id: 2 });
  });

  it('returns correct return shape', () => {
    const fetchFn = () => Promise.resolve({ id: 1 });
    const initialData = { id: 0 };

    const { result } = renderHook(() => useStaleWhileRevalidate({ fetchFn, initialData }));

    expect(result.current).toHaveProperty('data');
    expect(result.current).toHaveProperty('isStale');
    expect(result.current).toHaveProperty('isLoading');
    expect(result.current).toHaveProperty('error');
    expect(result.current).toHaveProperty('refresh');
    expect(typeof result.current.refresh).toBe('function');
  });
});