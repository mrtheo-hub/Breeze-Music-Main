import type { Album, Artist, HomeSection, Playlist, SearchResult, Track } from './types';

export type SearchFilter = 'songs' | 'albums' | 'artists' | 'playlists';

/** Every way Breeze reads music data. Implementations must throw only SourceError. */
export interface MusicSource {
  home(): Promise<HomeSection[]>;
  search(query: string, filter?: SearchFilter): Promise<SearchResult>;
  track(id: string): Promise<Track>;
  album(id: string): Promise<Album>;
  artist(id: string): Promise<Artist>;
  playlist(id: string): Promise<Playlist>;
  /** Radio / autoplay continuation for a track. Never includes the seed track. */
  upNext(trackId: string): Promise<Track[]>;
}
