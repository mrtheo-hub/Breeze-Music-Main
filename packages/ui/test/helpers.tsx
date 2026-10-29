import { MemoryStorage, type MusicSource, type Track } from '@breeze/core';
import { PlayerController } from '../src/player/controller';
import { Emitter } from '../src/player/emitter';
import type { AudioEngine, EngineEvents } from '../src/player/engine';

export const t = (id: string, extra: Partial<Track> = {}): Track => ({
  id,
  title: `Song ${id}`,
  artists: [{ name: `Artist ${id}` }],
  thumbnails: [],
  ...extra,
});

export const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

export class FakeEngine implements AudioEngine {
  readonly events = new Emitter<EngineEvents>();
  readonly loaded: string[] = [];
  readonly plays: string[] = [];
  readonly seeks: number[] = [];
  readonly failIds = new Set<string>();
  readonly gates = new Map<string, Promise<void>>();
  volume = 1;

  async load(track: Track): Promise<void> {
    this.loaded.push(track.id);
    await this.gates.get(track.id);
    if (this.failIds.has(track.id)) throw new Error('Request to https://x failed with status code 403');
  }

  play(): void {
    this.plays.push(this.loaded.at(-1) ?? '');
    this.events.emit('state', 'playing');
  }

  pause(): void {
    this.events.emit('state', 'paused');
  }

  seek(seconds: number): void {
    this.seeks.push(seconds);
  }

  setVolume(v: number): void {
    this.volume = v;
  }

  on<K extends keyof EngineEvents>(event: K, cb: (payload: EngineEvents[K]) => void): () => void {
    return this.events.on(event, cb);
  }
}

export function fakeSource(over: Partial<MusicSource> = {}): MusicSource {
  const missing = () => Promise.reject(new Error('not stubbed'));
  return {
    home: missing,
    search: missing,
    track: missing,
    album: missing,
    artist: missing,
    playlist: missing,
    upNext: async () => [],
    ...over,
  };
}

export function setup(over: { source?: Partial<MusicSource>; autoplay?: boolean } = {}) {
  const engine = new FakeEngine();
  const storage = new MemoryStorage();
  const source = fakeSource(over.source);
  const player = new PlayerController({ engine, source, storage, autoplay: () => over.autoplay ?? true });
  return { engine, storage, source, player };
}
