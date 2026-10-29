import type { AlbumSummary, ArtistSummary, HomeItem, PlaylistSummary, Thumbnail, Track } from './types';

export interface RawThumb {
  url: string;
  width?: number;
  height?: number;
}

/** Loose view of the youtubei.js music nodes Breeze reads. Every field is optional on purpose. */
export interface RawItem {
  id?: string;
  video_id?: string;
  item_type?: string;
  title?: unknown;
  name?: unknown;
  artists?: { name: string; channel_id?: string }[];
  author?: { name?: string; channel_id?: string };
  album?: { id?: string; name: string };
  duration?: { seconds?: number };
  thumbnail?: { contents?: RawThumb[] } | RawThumb[];
  thumbnails?: RawThumb[];
  year?: string;
}

export const toText = (v: unknown): string => (v == null ? '' : String(v)).trim();

export function mapThumbs(raw: Pick<RawItem, 'thumbnail' | 'thumbnails'> | undefined): Thumbnail[] {
  const t = raw?.thumbnail;
  const list = Array.isArray(t) ? t : (t?.contents ?? raw?.thumbnails ?? []);
  return list.filter((x) => Boolean(x?.url)).map((x) => ({ url: x.url, width: x.width ?? 0, height: x.height ?? 0 }));
}

export function mapTrack(raw: RawItem): Track | null {
  const id = raw.id ?? raw.video_id;
  if (!id) return null;
  const artists = raw.artists?.length
    ? raw.artists.map((a) => ({ id: a.channel_id, name: a.name }))
    : raw.author?.name
      ? [{ id: raw.author.channel_id, name: raw.author.name }]
      : [];
  return {
    id,
    title: toText(raw.title),
    artists,
    album: raw.album?.name ? { id: raw.album.id, name: raw.album.name } : undefined,
    durationSec: raw.duration?.seconds,
    thumbnails: mapThumbs(raw),
  };
}

export function mapAlbumSummary(raw: RawItem): AlbumSummary | null {
  if (!raw.id) return null;
  return { id: raw.id, title: toText(raw.title), year: raw.year, thumbnails: mapThumbs(raw) };
}

export function mapArtistSummary(raw: RawItem): ArtistSummary | null {
  if (!raw.id) return null;
  return { id: raw.id, name: toText(raw.name ?? raw.title), thumbnails: mapThumbs(raw) };
}

export function mapPlaylistSummary(raw: RawItem): PlaylistSummary | null {
  if (!raw.id) return null;
  return { id: raw.id, title: toText(raw.title), author: raw.author?.name, thumbnails: mapThumbs(raw) };
}

export function mapHomeItem(raw: RawItem): HomeItem | null {
  switch (raw.item_type) {
    case 'song':
    case 'video': {
      const track = mapTrack(raw);
      return track && { kind: 'track', track };
    }
    case 'album': {
      const album = mapAlbumSummary(raw);
      return album && { kind: 'album', album };
    }
    case 'artist': {
      const artist = mapArtistSummary(raw);
      return artist && { kind: 'artist', artist };
    }
    case 'playlist': {
      const playlist = mapPlaylistSummary(raw);
      return playlist && { kind: 'playlist', playlist };
    }
    default:
      return null;
  }
}
