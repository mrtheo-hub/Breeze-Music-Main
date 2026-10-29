import type { AudioQuality, Track } from '@breeze/core';
import type { StreamInfo } from '@breeze/core/stream';
import { type AudioEngine, Emitter, type EngineEvents } from '@breeze/ui/player';

export interface StreamSource {
  resolve(id: string, quality: AudioQuality): Promise<StreamInfo>;
}

/** Re-resolve this long before the URL's stated expiry. */
const EXPIRY_MARGIN_MS = 60_000;

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

/** Plays resolved YouTube audio streams through an <audio> element. */
export class HtmlAudioEngine implements AudioEngine {
  private readonly events = new Emitter<EngineEvents>();
  private track: Track | null = null;
  private stream: StreamInfo | null = null;
  private retried = false;

  constructor(
    private readonly streams: StreamSource,
    private readonly quality: () => AudioQuality,
    private readonly audio: HTMLAudioElement = new Audio(),
  ) {
    audio.preload = 'auto';
    audio.addEventListener('timeupdate', () =>
      this.events.emit('time', {
        position: audio.currentTime,
        duration: Number.isFinite(audio.duration) ? audio.duration : 0,
      }),
    );
    audio.addEventListener('playing', () => {
      this.retried = false;
      this.events.emit('state', 'playing');
    });
    audio.addEventListener('pause', () => this.events.emit('state', 'paused'));
    audio.addEventListener('waiting', () => this.events.emit('state', 'loading'));
    audio.addEventListener('ended', () => this.events.emit('ended', undefined));
    audio.addEventListener('error', () => void this.recover());
  }

  async load(track: Track): Promise<void> {
    this.track = track;
    this.retried = false;
    this.events.emit('state', 'loading');
    await this.setSource(track, 0);
  }

  play(): void {
    if (this.track && this.stream && Date.now() > this.stream.expiresAt - EXPIRY_MARGIN_MS) {
      void this.reload(this.audio.currentTime); // expired while paused
      return;
    }
    this.audio.play().catch((e: unknown) => {
      if (!isAbort(e)) this.events.emit('error', e);
    });
  }

  pause(): void {
    this.audio.pause();
  }

  seek(seconds: number): void {
    this.audio.currentTime = seconds;
  }

  setVolume(v: number): void {
    this.audio.volume = v;
  }

  on<K extends keyof EngineEvents>(event: K, cb: (payload: EngineEvents[K]) => void): () => void {
    return this.events.on(event, cb);
  }

  private async setSource(track: Track, at: number): Promise<void> {
    const stream = await this.streams.resolve(track.id, this.quality());
    if (this.track !== track) return; // a newer load won
    this.stream = stream;
    this.audio.src = stream.url;
    if (at > 0) this.audio.currentTime = at;
  }

  private async reload(at: number): Promise<void> {
    const track = this.track;
    if (!track) return;
    try {
      await this.setSource(track, at);
      if (this.track === track) await this.audio.play();
    } catch (e) {
      if (this.track === track && !isAbort(e)) this.events.emit('error', e);
    }
  }

  /** Stream URLs expire or get 403'd: get a fresh one once, at the same position, before giving up. */
  private async recover(): Promise<void> {
    if (!this.track) return;
    if (this.retried) {
      this.events.emit('error', this.audio.error ?? new Error('Playback failed'));
      return;
    }
    this.retried = true;
    await this.reload(this.audio.currentTime);
  }
}
