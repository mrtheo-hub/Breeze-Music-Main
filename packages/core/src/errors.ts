export type SourceErrorKind = 'network' | 'blocked' | 'not_found' | 'parse';

export class SourceError extends Error {
  constructor(
    readonly kind: SourceErrorKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'SourceError';
  }
}

const NOT_FOUND = /not found|404|does not exist|unavailable/i;
const NETWORK = /fetch failed|ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|network/i;
const BLOCKED = /429|403|captcha|sign in|bot/i;

/** Normalise anything thrown by youtubei.js or fetch into a SourceError. */
export function toSourceError(e: unknown): SourceError {
  if (e instanceof SourceError) return e;
  const message = e instanceof Error ? e.message : String(e);
  const kind = NOT_FOUND.test(message)
    ? 'not_found'
    : NETWORK.test(message)
      ? 'network'
      : BLOCKED.test(message)
        ? 'blocked'
        : 'parse';
  return new SourceError(kind, message, { cause: e });
}
