import type { Track } from '@breeze/core';

export type PlaybackState = 'loading' | 'playing' | 'paused';

export interface EngineEvents {
  time: { position: number; duration: number };
  ended: undefined;
  error: unknown;
  state: PlaybackState;
}

/** Plays one track at a time. Desktop: <audio> + resolved stream. Web: YouTube IFrame player. */
export interface AudioEngine {
  load(track: Track): Promise<void>;
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  setVolume(v: number): void;
  on<K extends keyof EngineEvents>(event: K, cb: (payload: EngineEvents[K]) => void): () => void;
}
