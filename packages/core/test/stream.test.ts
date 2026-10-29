import { describe, expect, it, vi } from 'vitest';
import { Platform } from 'youtubei.js';
import { SourceError } from '../src/errors';
import {
  expiryOf,
  installVmEvaluator,
  pickFormat,
  type RawFormat,
  type StreamClient,
  StreamResolver,
} from '../src/stream';

const fmt = (bitrate: number, over: Partial<RawFormat> = {}): RawFormat => ({
  has_audio: true,
  has_video: false,
  bitrate,
  mime_type: 'audio/mp4; codecs="mp4a.40.2"',
  decipher: async () => `https://rr1.googlevideo.com/videoplayback?expire=2000000000&b=${bitrate}`,
  ...over,
});

const info = (formats: RawFormat[]) => ({ streaming_data: { adaptive_formats: formats } });

describe('pickFormat', () => {
  const formats = [fmt(160_000), fmt(50_000), fmt(130_000), fmt(999_000, { has_video: true })];

  it('ignores video formats and picks by quality', () => {
    expect(pickFormat(formats, 'high')?.bitrate).toBe(160_000);
    expect(pickFormat(formats, 'low')?.bitrate).toBe(50_000);
    expect(pickFormat(formats, 'medium')?.bitrate).toBe(130_000);
  });

  it('returns null when there is no audio-only format', () => {
    expect(pickFormat([fmt(1, { has_video: true })], 'high')).toBeNull();
    expect(pickFormat([], 'high')).toBeNull();
  });
});

describe('expiryOf', () => {
  it('reads the expire query param (seconds) as ms', () => {
    expect(expiryOf('https://x/videoplayback?expire=2000000000')).toBe(2_000_000_000_000);
  });

  it('falls back to now + 6h', () => {
    expect(expiryOf('https://x/videoplayback', 1000)).toBe(1000 + 6 * 3600 * 1000);
  });
});

describe('installVmEvaluator', () => {
  it('runs code with env bindings and without Node globals', async () => {
    installVmEvaluator();
    const run = (output: string, env: Record<string, unknown> = {}) =>
      Platform.shim.eval({ output } as never, env as never);
    expect(await run('return typeof process')).toBe('undefined');
    expect(await run('return typeof require')).toBe('undefined');
    expect(await run('return n + 1', { n: 41 })).toBe(42);
  });
});

describe('StreamResolver.resolve', () => {
  const client = (over: Partial<StreamClient> = {}): StreamClient => ({
    player: { id: 'player' },
    musicInfo: vi.fn(async () => info([fmt(130_000)])),
    iosInfo: vi.fn(async () => info([fmt(64_000)])),
    ...over,
  });

  it('uses the music client first and deciphers with the player', async () => {
    const decipher = vi.fn(async () => 'https://rr1.googlevideo.com/videoplayback?expire=2000000000');
    const c = client({ musicInfo: vi.fn(async () => info([fmt(130_000, { decipher })])) });
    const s = await new StreamResolver(c).resolve('abc', 'high');
    expect(s).toEqual({
      url: 'https://rr1.googlevideo.com/videoplayback?expire=2000000000',
      mimeType: 'audio/mp4; codecs="mp4a.40.2"',
      bitrate: 130_000,
      expiresAt: 2_000_000_000_000,
    });
    expect(decipher).toHaveBeenCalledWith({ id: 'player' });
    expect(c.iosInfo).not.toHaveBeenCalled();
  });

  it('falls back to the IOS client when the music client has no audio', async () => {
    const c = client({ musicInfo: vi.fn(async () => info([])) });
    expect((await new StreamResolver(c).resolve('abc')).bitrate).toBe(64_000);
  });

  it('falls back to the IOS client when the music client throws', async () => {
    const c = client({
      musicInfo: vi.fn(async () => {
        throw new Error('No valid URL to decipher');
      }),
    });
    expect((await new StreamResolver(c).resolve('abc')).bitrate).toBe(64_000);
  });

  it('reports the last failure as a SourceError when both clients fail', async () => {
    const c = client({
      musicInfo: vi.fn(async () => info([])),
      iosInfo: vi.fn(async () => {
        throw new Error('Request to https://x failed with status code 403');
      }),
    });
    const err = await new StreamResolver(c).resolve('abc').catch((e) => e);
    expect(err).toBeInstanceOf(SourceError);
    expect(err.kind).toBe('blocked');
  });

  it('reports not_found when no client has any audio', async () => {
    const c = client({ musicInfo: vi.fn(async () => info([])), iosInfo: vi.fn(async () => ({})) });
    const err = await new StreamResolver(c).resolve('abc').catch((e) => e);
    expect(err.kind).toBe('not_found');
  });
});
