import { SourceError, type SourceErrorKind, toSourceError } from '@breeze/core';

/** IPC drops Error subclasses and custom fields, so errors cross as plain data. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: { kind: SourceErrorKind; message: string } };

export async function toResult<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    const err = toSourceError(e);
    return { ok: false, error: { kind: err.kind, message: err.message } };
  }
}

export function unwrap<T>(r: Result<T>): T {
  if (r.ok) return r.value;
  throw new SourceError(r.error.kind, r.error.message);
}
