import {
  current,
  emptyQueue,
  enqueue,
  type MusicSource,
  next as nextInQueue,
  prev as prevInQueue,
  type QueueState,
  type RepeatMode,
  type Storage,
  setQueue,
  setRepeat,
  toggleShuffle as shuffleQueue,
  type Track,
  toSourceError,
} from '@breeze/core';
import type { AudioEngine, PlaybackState } from './engine';

export type PlayerStatus = 'idle' | PlaybackState;

export interface PlayerState {
  queue: QueueState;
  status: PlayerStatus;
  position: number;
  duration: number;
  volume: number;
  /** User-facing message for the last failure, or null. */
  error: string | null;
}

export interface PlayerDeps {
  engine: AudioEngine;
  source: MusicSource;
  storage: Storage;
  /** Read each time the queue ends, so a settings change applies immediately. */
  autoplay?: () => boolean;
}

const MAX_FAILURES = 3;
const RESTART_AFTER_SEC = 3;
const REPEAT_ORDER: RepeatMode[] = ['off', 'all', 'one'];

export class PlayerController {
  private state: PlayerState;
  private readonly listeners = new Set<() => void>();
  private failures = 0;
  private loadToken = 0;
  private loadInFlight = false;
  private lastVolume: number;

  constructor(
    private readonly deps: PlayerDeps,
    volume = 0.8,
  ) {
    this.lastVolume = volume;
    this.state = { queue: emptyQueue(), status: 'idle', position: 0, duration: 0, volume, error: null };
    deps.engine.setVolume(volume);
    deps.engine.on('time', ({ position, duration }) =>
      this.patch({ position, duration: duration || this.state.duration }),
    );
    deps.engine.on('state', (status) => {
      if (status === 'playing') this.failures = 0;
      this.patch({ status });
    });
    deps.engine.on('ended', () => void this.advance(true));
    deps.engine.on('error', (e) => {
      // While engine.load() is pending, that call reports its own failure; an error now is from the previous track.
      if (!this.loadInFlight) void this.fail(e);
    });
  }

  readonly getState = (): PlayerState => this.state;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  playTracks(tracks: Track[], startIndex = 0): Promise<void> {
    this.failures = 0;
    this.patch({ queue: setQueue(this.state.queue, tracks, startIndex), error: null });
    return this.load();
  }

  resume(): void {
    if (current(this.state.queue)) this.deps.engine.play();
  }

  pause(): void {
    this.deps.engine.pause();
  }

  playPause(): void {
    if (this.state.status === 'playing') this.pause();
    else this.resume();
  }

  next(): Promise<void> {
    return this.advance(false);
  }

  prev(): Promise<void> {
    if (this.state.position > RESTART_AFTER_SEC) {
      this.seek(0);
      return Promise.resolve();
    }
    this.patch({ queue: prevInQueue(this.state.queue) });
    return this.load();
  }

  seek(seconds: number): void {
    this.deps.engine.seek(seconds);
    this.patch({ position: seconds });
  }

  setVolume(volume: number): void {
    const v = Math.min(1, Math.max(0, volume));
    if (v > 0) this.lastVolume = v;
    this.deps.engine.setVolume(v);
    this.patch({ volume: v });
  }

  toggleMute(): void {
    this.setVolume(this.state.volume > 0 ? 0 : this.lastVolume);
  }

  toggleShuffle(): void {
    this.patch({ queue: shuffleQueue(this.state.queue) });
  }

  cycleRepeat(): void {
    const at = REPEAT_ORDER.indexOf(this.state.queue.repeat);
    const mode = REPEAT_ORDER[(at + 1) % REPEAT_ORDER.length] as RepeatMode;
    this.patch({ queue: setRepeat(this.state.queue, mode) });
  }

  dismissError(): void {
    this.patch({ error: null });
  }

  private patch(change: Partial<PlayerState>): void {
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener();
  }

  private async advance(auto: boolean): Promise<void> {
    if (auto && this.state.queue.repeat === 'one') {
      this.seek(0);
      this.deps.engine.play();
      return;
    }
    const { state, ended } = nextInQueue(this.state.queue, auto);
    if (!ended) {
      this.patch({ queue: state });
      return this.load();
    }
    if (!auto) return;
    const seed = current(this.state.queue);
    if (seed && (this.deps.autoplay?.() ?? true)) {
      const token = this.loadToken;
      try {
        const more = await this.deps.source.upNext(seed.id);
        if (token !== this.loadToken) return; // the user chose something else meanwhile
        if (more.length > 0) {
          this.patch({ queue: nextInQueue(enqueue(this.state.queue, more)).state });
          return this.load();
        }
      } catch (e) {
        if (token !== this.loadToken) return;
        this.patch({ error: messageFor(e) });
      }
    }
    this.patch({ status: 'paused', position: 0 });
  }

  private async load(): Promise<void> {
    const track = current(this.state.queue);
    if (!track) {
      this.patch({ status: 'idle', position: 0, duration: 0 });
      return;
    }
    const token = ++this.loadToken;
    this.patch({ status: 'loading', position: 0, duration: track.durationSec ?? 0 });
    this.loadInFlight = true;
    try {
      try {
        await this.deps.engine.load(track);
      } finally {
        if (token === this.loadToken) this.loadInFlight = false;
      }
      if (token !== this.loadToken) return; // a newer click won
      this.deps.engine.play();
      this.deps.storage.addHistory(track).catch(() => undefined);
    } catch (e) {
      if (token === this.loadToken) await this.fail(e);
    }
  }

  private async fail(e: unknown): Promise<void> {
    this.failures += 1;
    this.patch({ error: messageFor(e) });
    if (this.failures >= MAX_FAILURES) {
      this.deps.engine.pause();
      this.patch({ status: 'paused' });
      return;
    }
    const { state, ended } = nextInQueue(this.state.queue);
    if (ended) {
      this.patch({ status: 'paused' });
      return;
    }
    this.patch({ queue: state });
    await this.load();
  }
}

function messageFor(e: unknown): string {
  switch (toSourceError(e).kind) {
    case 'network':
      return "Can't reach YouTube Music. Check your connection.";
    case 'blocked':
      return 'YouTube is limiting requests. Try again in a minute.';
    case 'not_found':
      return "That track isn't available.";
    default:
      return "Couldn't play that track.";
  }
}
