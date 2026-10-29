import { Innertube } from 'youtubei.js';
import { SourceError, toSourceError } from './errors';
import { mapHomeItem, mapThumbs, mapTrack, type RawItem, toText } from './mappers';
import type { MusicSource, SearchFilter } from './source';
import type { Album, Artist, HomeItem, HomeSection, Playlist, SearchResult, Track } from './types';

/**
 * The subset of youtubei.js `yt.music` Breeze uses. Results are `any` on purpose:
 * youtubei.js node classes change between versions, and mappers.ts reads them defensively.
 */
export interface MusicClient {
  search(query: string, options?: { type?: string }): Promise<any>;
  getHomeFeed(): Promise<any>;
  getInfo(id: string): Promise<any>;
  getAlbum(id: string): Promise<any>;
  getArtist(id: string): Promise<any>;
  getPlaylist(id: string): Promise<any>;
  getUpNext(id: string): Promise<any>;
}

const FILTER_TYPE: Record<SearchFilter, string> = {
  songs: 'song',
  albums: 'album',
  artists: 'artist',
  playlists: 'playlist',
};

const YEAR = /\b(19|20)\d{2}\b/;

export class InnerTubeSource implements MusicSource {
  constructor(private readonly music: MusicClient) {}

  static create(): Promise<InnerTubeSource> {
    return guard(async () => {
      const yt = await Innertube.create();
      return new InnerTubeSource(yt.music as unknown as MusicClient);
    });
  }

  home(): Promise<HomeSection[]> {
    return guard(async () => {
      const feed = await this.music.getHomeFeed();
      const sections: any[] = feed?.sections ?? [];
      return sections
        .map((s) => ({ title: toText(s?.header?.title ?? s?.title), items: items(s?.contents) }))
        .filter((s) => s.items.length > 0);
    });
  }

  async search(query: string, filter?: SearchFilter): Promise<SearchResult> {
    const q = query.trim();
    if (!q) return emptySearch();
    return guard(async () => {
      const res = await this.music.search(q, filter ? { type: FILTER_TYPE[filter] } : undefined);
      const shelves: any[] = res?.contents ?? [];
      return groupItems(items(shelves.flatMap((s) => s?.contents ?? [])));
    });
  }

  track(id: string): Promise<Track> {
    return guard(async () => {
      const b = (await this.music.getInfo(id))?.basic_info;
      const track = b
        ? mapTrack({
            id: b.id ?? id,
            title: b.title,
            author: { name: b.author, channel_id: b.channel_id },
            duration: { seconds: b.duration },
            thumbnail: b.thumbnail,
          })
        : null;
      if (!track?.title) throw new SourceError('not_found', `Track ${id} not found`);
      return track;
    });
  }

  album(id: string): Promise<Album> {
    return guard(async () => {
      const a = await this.music.getAlbum(id);
      const h = a?.header;
      const title = toText(h?.title);
      const thumbnails = mapThumbs(h);
      const raw = tracksOf(a?.contents);
      // Album pages put the artist in the header strapline; tracks often carry none.
      const strapline = toText(h?.strapline_text_one);
      const artists = h?.author?.name
        ? [{ id: h.author.channel_id, name: h.author.name }]
        : strapline
          ? [{ name: strapline }]
          : (raw[0]?.artists ?? []);
      const tracks = raw.map((t) => ({
        ...t,
        artists: t.artists.length > 0 ? t.artists : artists,
        album: t.album ?? { id, name: title },
        thumbnails: t.thumbnails.length > 0 ? t.thumbnails : thumbnails,
      }));
      return { id, title, year: toText(h?.subtitle).match(YEAR)?.[0], artists, thumbnails, tracks };
    });
  }

  artist(id: string): Promise<Artist> {
    return guard(async () => {
      const r = await this.music.getArtist(id);
      const all = items((r?.sections ?? []).flatMap((s: any) => s?.contents ?? []));
      return {
        id,
        name: toText(r?.header?.title),
        thumbnails: mapThumbs(r?.header),
        topTracks: all.flatMap((i) => (i.kind === 'track' ? [i.track] : [])).slice(0, 10),
        albums: all.flatMap((i) => (i.kind === 'album' ? [i.album] : [])),
      };
    });
  }

  playlist(id: string): Promise<Playlist> {
    return guard(async () => {
      const p = await this.music.getPlaylist(id);
      return {
        id,
        title: toText(p?.header?.title),
        author: p?.header?.author?.name,
        thumbnails: mapThumbs(p?.header),
        tracks: tracksOf(p?.items ?? p?.contents),
      };
    });
  }

  upNext(trackId: string): Promise<Track[]> {
    return guard(async () => {
      const u = await this.music.getUpNext(trackId);
      return tracksOf(u?.contents).filter((t) => t.id !== trackId);
    });
  }
}

function items(raw: unknown): HomeItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r: RawItem) => mapHomeItem(r)).filter((i): i is HomeItem => i !== null);
}

function tracksOf(raw: unknown): Track[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r: RawItem) => mapTrack(r)).filter((t): t is Track => t !== null);
}

function groupItems(list: HomeItem[]): SearchResult {
  const r = emptySearch();
  for (const i of list) {
    if (i.kind === 'track') r.songs.push(i.track);
    else if (i.kind === 'album') r.albums.push(i.album);
    else if (i.kind === 'artist') r.artists.push(i.artist);
    else r.playlists.push(i.playlist);
  }
  return r;
}

function emptySearch(): SearchResult {
  return { songs: [], albums: [], artists: [], playlists: [] };
}

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw toSourceError(e);
  }
}
