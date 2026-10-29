import { SourceError } from './errors';
import { parseLrc } from './lrc';
import type { Lyrics } from './types';

export type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface LyricsQuery {
  title: string;
  artist: string;
  album?: string;
  durationSec?: number;
}

interface LrclibRecord {
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
  instrumental?: boolean;
}

const BASE = 'https://lrclib.net/api';
const NONE: Lyrics = { synced: null, plain: null };

export async function fetchLyrics(q: LyricsQuery, fetcher: Fetcher = (url) => fetch(url)): Promise<Lyrics> {
  if (q.durationSec != null) {
    const params = new URLSearchParams({
      track_name: q.title,
      artist_name: q.artist,
      duration: String(Math.round(q.durationSec)),
    });
    if (q.album) params.set('album_name', q.album);
    const record = await getJson<LrclibRecord>(fetcher, `${BASE}/get?${params}`);
    if (record) return toLyrics(record);
  }
  const params = new URLSearchParams({ track_name: q.title, artist_name: q.artist });
  const list = await getJson<LrclibRecord[]>(fetcher, `${BASE}/search?${params}`);
  const best = list?.find((r) => r.syncedLyrics) ?? list?.[0];
  return best ? toLyrics(best) : NONE;
}

async function getJson<T>(fetcher: Fetcher, url: string): Promise<T | null> {
  let res: Awaited<ReturnType<Fetcher>>;
  try {
    res = await fetcher(url);
  } catch (e) {
    throw new SourceError('network', 'Lyrics request failed', { cause: e });
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new SourceError('network', `Lyrics request failed with status ${res.status}`);
  try {
    return (await res.json()) as T;
  } catch (e) {
    throw new SourceError('parse', 'Lyrics response was not JSON', { cause: e });
  }
}

function toLyrics(r: LrclibRecord): Lyrics {
  if (r.instrumental) return NONE;
  const synced = r.syncedLyrics ? parseLrc(r.syncedLyrics) : [];
  return { synced: synced.length > 0 ? synced : null, plain: r.plainLyrics?.trim() || null };
}
