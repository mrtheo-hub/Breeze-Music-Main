import { describe, expect, it } from 'vitest';
import { SourceError } from '../src/errors';
import { type Fetcher, fetchLyrics } from '../src/lyrics';

type Route = { status: number; body?: unknown };

function fakeFetch(routes: Record<string, Route>) {
  const calls: URL[] = [];
  const fetcher: Fetcher = async (url) => {
    const u = new URL(url);
    calls.push(u);
    const r = routes[u.pathname] ?? { status: 404 };
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  };
  return { fetcher, calls };
}

const query = { title: 'Get Lucky', artist: 'Daft Punk', album: 'Random Access Memories', durationSec: 247.6 };

describe('fetchLyrics', () => {
  it('uses /api/get with rounded duration and parses synced lyrics', async () => {
    const { fetcher, calls } = fakeFetch({
      '/api/get': { status: 200, body: { syncedLyrics: '[00:01.00]Hi', plainLyrics: 'Hi\n' } },
    });
    const out = await fetchLyrics(query, fetcher);
    expect(out).toEqual({ synced: [{ timeMs: 1000, text: 'Hi' }], plain: 'Hi' });
    expect(calls[0]?.pathname).toBe('/api/get');
    expect(calls[0]?.searchParams.get('duration')).toBe('248');
    expect(calls[0]?.searchParams.get('album_name')).toBe('Random Access Memories');
  });

  it('falls back to /api/search on 404 and prefers a synced result', async () => {
    const { fetcher, calls } = fakeFetch({
      '/api/search': {
        status: 200,
        body: [{ plainLyrics: 'plain only' }, { syncedLyrics: '[00:02.00]Yo', plainLyrics: 'Yo' }],
      },
    });
    const out = await fetchLyrics(query, fetcher);
    expect(out.synced).toEqual([{ timeMs: 2000, text: 'Yo' }]);
    expect(calls.map((c) => c.pathname)).toEqual(['/api/get', '/api/search']);
  });

  it('skips /api/get when duration is unknown', async () => {
    const { fetcher, calls } = fakeFetch({ '/api/search': { status: 200, body: [] } });
    await fetchLyrics({ title: 'x', artist: 'y' }, fetcher);
    expect(calls.map((c) => c.pathname)).toEqual(['/api/search']);
  });

  it('returns empty lyrics when nothing is found', async () => {
    const { fetcher } = fakeFetch({ '/api/search': { status: 200, body: [] } });
    expect(await fetchLyrics(query, fetcher)).toEqual({ synced: null, plain: null });
  });

  it('returns empty lyrics for instrumentals', async () => {
    const { fetcher } = fakeFetch({ '/api/get': { status: 200, body: { instrumental: true, plainLyrics: '' } } });
    expect(await fetchLyrics(query, fetcher)).toEqual({ synced: null, plain: null });
  });

  it('treats a 400 (LRCLIB rejects the query) as no lyrics', async () => {
    const { fetcher } = fakeFetch({ '/api/get': { status: 400 }, '/api/search': { status: 400 } });
    expect(await fetchLyrics({ ...query, artist: '' }, fetcher)).toEqual({ synced: null, plain: null });
  });

  it('treats a non-array search body as no lyrics', async () => {
    const { fetcher } = fakeFetch({ '/api/search': { status: 200, body: { error: 'odd' } } });
    expect(await fetchLyrics({ title: 'x', artist: 'y' }, fetcher)).toEqual({ synced: null, plain: null });
  });

  it('throws SourceError network on a 5xx', async () => {
    const { fetcher } = fakeFetch({ '/api/get': { status: 503 } });
    await expect(fetchLyrics(query, fetcher)).rejects.toMatchObject({ kind: 'network' });
  });

  it('throws SourceError network when fetch itself fails', async () => {
    const fetcher: Fetcher = async () => {
      throw new TypeError('fetch failed');
    };
    const err = await fetchLyrics(query, fetcher).catch((e) => e);
    expect(err).toBeInstanceOf(SourceError);
    expect(err.kind).toBe('network');
  });
});
