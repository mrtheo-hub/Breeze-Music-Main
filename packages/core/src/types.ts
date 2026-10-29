export interface Thumbnail {
  url: string;
  width: number;
  height: number;
}

export interface ArtistRef {
  id?: string;
  name: string;
}

export interface AlbumRef {
  id?: string;
  name: string;
}

export interface Track {
  id: string;
  title: string;
  artists: ArtistRef[];
  album?: AlbumRef;
  durationSec?: number;
  thumbnails: Thumbnail[];
}

export interface AlbumSummary {
  id: string;
  title: string;
  year?: string;
  thumbnails: Thumbnail[];
}

export interface ArtistSummary {
  id: string;
  name: string;
  thumbnails: Thumbnail[];
}

export interface PlaylistSummary {
  id: string;
  title: string;
  author?: string;
  thumbnails: Thumbnail[];
}

export interface Album extends AlbumSummary {
  artists: ArtistRef[];
  tracks: Track[];
}

export interface Artist extends ArtistSummary {
  topTracks: Track[];
  albums: AlbumSummary[];
}

export interface Playlist extends PlaylistSummary {
  tracks: Track[];
}

export interface SearchResult {
  songs: Track[];
  albums: AlbumSummary[];
  artists: ArtistSummary[];
  playlists: PlaylistSummary[];
}

export type HomeItem =
  | { kind: 'track'; track: Track }
  | { kind: 'album'; album: AlbumSummary }
  | { kind: 'artist'; artist: ArtistSummary }
  | { kind: 'playlist'; playlist: PlaylistSummary };

export interface HomeSection {
  title: string;
  items: HomeItem[];
}

export interface LyricsLine {
  timeMs: number;
  text: string;
}

export interface Lyrics {
  synced: LyricsLine[] | null;
  plain: string | null;
}

export interface LocalPlaylist {
  id: string;
  name: string;
  tracks: Track[];
  createdAt: number;
  updatedAt: number;
}

export type Theme = 'light' | 'dark' | 'system';
export type AudioQuality = 'low' | 'medium' | 'high';

export interface Settings {
  theme: Theme;
  audioQuality: AudioQuality;
  autoplay: boolean;
  volume: number;
}
