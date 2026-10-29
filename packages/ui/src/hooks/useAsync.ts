import { type SourceError, toSourceError } from '@breeze/core';
import { useCallback, useEffect, useRef, useState } from 'react';

export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; error: SourceError };

/** Load data for `key`. A null key is idle; a newer key or retry drops the older result. */
export function useAsync<T>(key: string | null, load: () => Promise<T>): AsyncState<T> & { retry: () => void } {
  const loadRef = useRef(load);
  loadRef.current = load;
  const [attempt, setAttempt] = useState(0);
  const effectKey = key === null ? null : `${key}#${attempt}`;
  const [settled, setSettled] = useState<{ key: string | null; value: AsyncState<T> }>({
    key: effectKey,
    value: effectKey === null ? { status: 'idle' } : { status: 'loading' },
  });

  useEffect(() => {
    if (effectKey === null) {
      setSettled({ key: null, value: { status: 'idle' } });
      return;
    }
    let live = true;
    setSettled({ key: effectKey, value: { status: 'loading' } });
    loadRef.current().then(
      (data) => {
        if (live) setSettled({ key: effectKey, value: { status: 'ready', data } });
      },
      (error: unknown) => {
        if (live) setSettled({ key: effectKey, value: { status: 'error', error: toSourceError(error) } });
      },
    );
    return () => {
      live = false;
    };
  }, [effectKey]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  // A result stored for another key is never shown: derive loading/idle synchronously.
  const state: AsyncState<T> =
    settled.key === effectKey ? settled.value : effectKey === null ? { status: 'idle' } : { status: 'loading' };
  return { ...state, retry };
}
