import { describe, expect, it } from 'vitest';
import { guard, SourceError, toSourceError } from '../src/errors';

describe('toSourceError', () => {
  it('passes a SourceError through unchanged', () => {
    const e = new SourceError('blocked', 'nope');
    expect(toSourceError(e)).toBe(e);
  });

  it.each([
    ['Video not found', 'not_found'],
    ['Request failed with status 404', 'not_found'],
    ['fetch failed', 'network'],
    ['getaddrinfo ENOTFOUND music.youtube.com', 'network'],
    ['Request failed with status 429', 'blocked'],
    ['Sign in to confirm you are not a bot', 'blocked'],
    ["Cannot read properties of undefined (reading 'contents')", 'parse'],
    ['Request to https://music.youtube.com/youtubei/v1/browse failed with status code 500', 'network'],
    ['Request to https://music.youtube.com/youtubei/v1/browse failed with status code 503', 'network'],
    ['Request to https://music.youtube.com/youtubei/v1/browse failed with status code 400', 'not_found'],
    ['Invalid album id', 'not_found'],
    ['Music queue was empty, the given id is probably invalid.', 'not_found'],
    ["Cannot read properties of undefined (reading 'bottom_text')", 'parse'],
    ['The operation was aborted due to timeout', 'network'],
  ] as const)('maps "%s" to %s', (message, kind) => {
    const out = toSourceError(new Error(message));
    expect(out).toBeInstanceOf(SourceError);
    expect(out.kind).toBe(kind);
    expect(out.message).toBe(message);
  });

  it('handles non-Error throws', () => {
    const out = toSourceError('boom');
    expect(out.kind).toBe('parse');
    expect(out.message).toBe('boom');
  });

  it('keeps the original error as cause', () => {
    const original = new Error('fetch failed');
    expect(toSourceError(original).cause).toBe(original);
  });
});

describe('guard', () => {
  it('returns the value', async () => {
    expect(await guard(async () => 7)).toBe(7);
  });

  it('turns any throw into a SourceError', async () => {
    const err = await guard(async () => {
      throw new Error('fetch failed');
    }).catch((e) => e);
    expect(err).toBeInstanceOf(SourceError);
    expect(err.kind).toBe('network');
  });
});
