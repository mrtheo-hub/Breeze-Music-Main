import type { AudioQuality, MusicSource, Storage } from '@breeze/core';
import type { StreamInfo } from '@breeze/core/stream';
import type { BreezeApi } from '../../shared/ipc';
import { unwrap } from '../../shared/result';

export function ipcSource(api: BreezeApi): MusicSource {
  return {
    home: async () => unwrap(await api.home()),
    search: async (query, filter) => unwrap(await api.search(query, filter)),
    track: async (id) => unwrap(await api.track(id)),
    album: async (id) => unwrap(await api.album(id)),
    artist: async (id) => unwrap(await api.artist(id)),
    playlist: async (id) => unwrap(await api.playlist(id)),
    upNext: async (id) => unwrap(await api.upNext(id)),
  };
}

export function ipcStorage(api: BreezeApi): Storage {
  return {
    getPlaylists: async () => unwrap(await api.getPlaylists()),
    savePlaylist: async (p) => unwrap(await api.savePlaylist(p)),
    deletePlaylist: async (id) => unwrap(await api.deletePlaylist(id)),
    getSettings: async () => unwrap(await api.getSettings()),
    saveSettings: async (s) => unwrap(await api.saveSettings(s)),
    addHistory: async (t) => unwrap(await api.addHistory(t)),
    getHistory: async (limit) => unwrap(await api.getHistory(limit)),
  };
}

export function ipcStreams(api: BreezeApi): { resolve(id: string, quality: AudioQuality): Promise<StreamInfo> } {
  return { resolve: async (id, quality) => unwrap(await api.resolveStream(id, quality)) };
}
