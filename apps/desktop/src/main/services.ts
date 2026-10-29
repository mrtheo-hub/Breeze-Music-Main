import type { AudioQuality, MusicSource, Storage } from '@breeze/core';
import { InnerTubeSource } from '@breeze/core/innertube';
import { type StreamInfo, StreamResolver } from '@breeze/core/stream';
import type { Methods } from '../shared/ipc';

export interface Factories {
  source(): Promise<MusicSource>;
  streams(): Promise<{ resolve(id: string, quality: AudioQuality): Promise<StreamInfo> }>;
}

const YOUTUBE: Factories = {
  source: () => InnerTubeSource.create(),
  streams: () => StreamResolver.create(),
};

/** Connect on first use, share the connection, and try again next call if connecting failed. */
function lazy<T>(make: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => {
    pending ??= make().catch((e) => {
      pending = null;
      throw e;
    });
    return pending;
  };
}

export function createServices(storage: Storage, factories: Factories = YOUTUBE): Methods {
  const source = lazy(factories.source);
  const streams = lazy(factories.streams);
  return {
    home: async () => (await source()).home(),
    search: async (query, filter) => (await source()).search(query, filter),
    track: async (id) => (await source()).track(id),
    album: async (id) => (await source()).album(id),
    artist: async (id) => (await source()).artist(id),
    playlist: async (id) => (await source()).playlist(id),
    upNext: async (id) => (await source()).upNext(id),
    resolveStream: async (id, quality) => (await streams()).resolve(id, quality),
    getPlaylists: () => storage.getPlaylists(),
    savePlaylist: (p) => storage.savePlaylist(p),
    deletePlaylist: (id) => storage.deletePlaylist(id),
    getSettings: () => storage.getSettings(),
    saveSettings: (s) => storage.saveSettings(s),
    addHistory: (t) => storage.addHistory(t),
    getHistory: (limit) => storage.getHistory(limit),
  };
}
