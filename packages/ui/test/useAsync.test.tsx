import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAsync } from '../src/hooks/useAsync';

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('useAsync', () => {
  it('is idle for a null key', () => {
    const { result } = renderHook(() => useAsync(null, async () => 1));
    expect(result.current.status).toBe('idle');
  });

  it('loads, then exposes data', async () => {
    const { result } = renderHook(() => useAsync('k', async () => 42));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready', data: 42 }));
  });

  it('wraps failures in SourceError', async () => {
    const { result } = renderHook(() =>
      useAsync('k', async () => {
        throw new Error('fetch failed');
      }),
    );
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.status === 'error' && result.current.error.kind).toBe('network');
  });

  it('drops a stale response after the key changes', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const loads: Record<string, Promise<string>> = { a: first.promise, b: second.promise };
    const { result, rerender } = renderHook(({ k }) => useAsync(k, () => loads[k] as Promise<string>), {
      initialProps: { k: 'a' },
    });
    rerender({ k: 'b' });
    await act(async () => {
      second.resolve('B');
    });
    await act(async () => {
      first.resolve('A');
    });
    expect(result.current).toMatchObject({ status: 'ready', data: 'B' });
  });

  it('retry loads again', async () => {
    const load = vi.fn(async () => 1);
    const { result } = renderHook(() => useAsync('k', load));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.retry());
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  });
});
