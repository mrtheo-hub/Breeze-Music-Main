import type { LocalPlaylist, Settings, Track } from './types';

export interface Storage {
  getPlaylists(): Promise<LocalPlaylist[]>;
  savePlaylist(p: LocalPlaylist): Promise<void>;
  deletePlaylist(id: string): Promise<void>;
  getSettings(): Promise<Settings>;
  saveSettings(s: Settings): Promise<void>;
  addHistory(t: Track): Promise<void>;
  getHistory(limit: number): Promise<Track[]>;
}

export const DEFAULT_SETTINGS: Settings = { theme: 'system', audioQuality: 'high', autoplay: true, volume: 0.8 };
export const HISTORY_LIMIT = 500;
/** Liked songs are stored as a LocalPlaylist with this id. */
export const LIKED_PLAYLIST_ID = 'liked';

export function pushHistory(history: Track[], track: Track, limit = HISTORY_LIMIT): Track[] {
  return [track, ...history.filter((h) => h.id !== track.id)].slice(0, limit);
}

export class MemoryStorage implements Storage {
  private playlists = new Map<string, LocalPlaylist>();
  private settings: Settings = { ...DEFAULT_SETTINGS };
  private history: Track[] = [];

  async getPlaylists(): Promise<LocalPlaylist[]> {
    return [...this.playlists.values()].map((p) => structuredClone(p)).sort((a, b) => a.createdAt - b.createdAt);
  }

  async savePlaylist(p: LocalPlaylist): Promise<void> {
    this.playlists.set(p.id, structuredClone(p));
  }

  async deletePlaylist(id: string): Promise<void> {
    this.playlists.delete(id);
  }

  async getSettings(): Promise<Settings> {
    return { ...this.settings };
  }

  async saveSettings(s: Settings): Promise<void> {
    this.settings = { ...s };
  }

  async addHistory(t: Track): Promise<void> {
    this.history = pushHistory(this.history, t);
  }

  async getHistory(limit: number): Promise<Track[]> {
    return this.history.slice(0, limit);
  }
}
