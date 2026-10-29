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

// youtubei.js reports HTTP failures as "Request to <url> failed with status code N".
const STATUS = /status(?: code)? (\d{3})\b/i;
const NOT_FOUND = /not found|does not exist|unavailable|invalid \w+ id|probably invalid/i;
const NETWORK = /fetch failed|ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|network|aborted|timed? ?out/i;
const BLOCKED = /\bbot\b|captcha|sign in/i;

function kindOf(message: string): SourceErrorKind {
  const status = Number(message.match(STATUS)?.[1] ?? 0);
  if (status === 404 || status === 400) return 'not_found';
  if (status === 429 || status === 403) return 'blocked';
  if (status >= 500) return 'network';
  if (NOT_FOUND.test(message)) return 'not_found';
  if (NETWORK.test(message)) return 'network';
  if (BLOCKED.test(message)) return 'blocked';
  return 'parse';
}

/** Normalise anything thrown by youtubei.js or fetch into a SourceError. */
export function toSourceError(e: unknown): SourceError {
  if (e instanceof SourceError) return e;
  const message = e instanceof Error ? e.message : String(e);
  return new SourceError(kindOf(message), message, { cause: e });
}

/** Run `fn`; rethrow anything it throws as a SourceError. */
export async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw toSourceError(e);
  }
}
