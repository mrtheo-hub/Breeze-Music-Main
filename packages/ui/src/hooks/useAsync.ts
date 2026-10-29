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
  const [state, setState] = useState<AsyncState<T>>(key === null ? { status: 'idle' } : { status: 'loading' });
  const effectKey = key === null ? null : `${key}#${attempt}`;

  useEffect(() => {
    if (effectKey === null) {
      setState({ status: 'idle' });
      return;
    }
    let live = true;
    setState({ status: 'loading' });
    loadRef.current().then(
      (data) => {
        if (live) setState({ status: 'ready', data });
      },
      (error: unknown) => {
        if (live) setState({ status: 'error', error: toSourceError(error) });
      },
    );
    return () => {
      live = false;
    };
  }, [effectKey]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}
