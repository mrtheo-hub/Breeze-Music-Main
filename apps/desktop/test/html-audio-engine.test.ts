import type { Track } from '@breeze/core';
import type { StreamInfo } from '@breeze/core/stream';
import { describe, expect, it, vi } from 'vitest';
import { HtmlAudioEngine, type StreamSource } from '../src/renderer/src/html-audio-engine';

class FakeAudio extends EventTarget {
  src = '';
  currentTime = 0;
  duration = Number.NaN;
  volume = 1;
  preload = '';
  error: unknown = null;
  play = vi.fn(async () => {});
  pause = vi.fn();
}

const t = (id: string): Track => ({ id, title: id, artists: [], thumbnails: [] });
const flush = () => new Promise((r) => setTimeout(r, 0));
const info = (url: string, expiresAt = Date.now() + 3_600_000): StreamInfo => ({
  url,
  mimeType: 'audio/mp4',
  bitrate: 1,
  expiresAt,
});

function make(resolve: StreamSource['resolve']) {
  const audio = new FakeAudio();
  const streams = { resolve: vi.fn(resolve) };
  const engine = new HtmlAudioEngine(streams, () => 'medium', audio as unknown as HTMLAudioElement);
  const errors: unknown[] = [];
  engine.on('error', (e) => errors.push(e));
  return { audio, streams, engine, errors };
}

describe('HtmlAudioEngine', () => {
  it('resolves the stream at the chosen quality and sets the source', async () => {
    const { audio, streams, engine } = make(async (id) => info(`https://s/${id}`));
    const states: string[] = [];
    engine.on('state', (s) => states.push(s));
    await engine.load(t('a'));
    expect(streams.resolve).toHaveBeenCalledWith('a', 'medium');
    expect(audio.src).toBe('https://s/a');
    expect(states).toEqual(['loading']);
  });

  it('keeps the newest track when an older load finishes late', async () => {
    let releaseA = (_: StreamInfo) => {};
    const { audio, engine } = make((id) =>
      id === 'a'
        ? new Promise<StreamInfo>((r) => {
            releaseA = r;
          })
        : Promise.resolve(info('https://s/b')),
    );
    const slow = engine.load(t('a'));
    await engine.load(t('b'));
    releaseA(info('https://s/a'));
    await slow;
    expect(audio.src).toBe('https://s/b');
  });

  it('re-resolves once at the same position after a media error, then reports the next one', async () => {
    let n = 0;
    const { audio, streams, engine, errors } = make(async () => info(`https://s/${++n}`));
    await engine.load(t('a'));
    audio.currentTime = 42;
    audio.dispatchEvent(new Event('error'));
    await flush();
    expect(streams.resolve).toHaveBeenCalledTimes(2);
    expect(audio.src).toBe('https://s/2');
    expect(audio.currentTime).toBe(42);
    expect(audio.play).toHaveBeenCalled();
    expect(errors).toEqual([]);

    audio.dispatchEvent(new Event('error'));
    await flush();
    expect(errors).toHaveLength(1);
  });

  it('gets a fresh URL before resuming an expired stream', async () => {
    let n = 0;
    const { audio, streams, engine } = make(async () =>
      info(`https://s/${++n}`, n === 1 ? Date.now() - 1 : Date.now() + 3_600_000),
    );
    await engine.load(t('a'));
    audio.currentTime = 90;
    engine.play();
    await flush();
    expect(streams.resolve).toHaveBeenCalledTimes(2);
    expect(audio.src).toBe('https://s/2');
    expect(audio.currentTime).toBe(90);
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it('ignores AbortError from play() when a new load interrupts it', async () => {
    const { audio, engine, errors } = make(async () => info('https://s/a'));
    audio.play = vi.fn(async () => {
      throw new DOMException('interrupted', 'AbortError');
    });
    await engine.load(t('a'));
    engine.play();
    await flush();
    expect(errors).toEqual([]);
  });

  it('maps media events', async () => {
    const { audio, engine } = make(async () => info('https://s/a'));
    await engine.load(t('a')); // handlers ignore events until a source is live
    const times: { position: number; duration: number }[] = [];
    const ended = vi.fn();
    engine.on('time', (x) => times.push(x));
    engine.on('ended', ended);
    audio.currentTime = 3;
    audio.dispatchEvent(new Event('timeupdate'));
    audio.dispatchEvent(new Event('ended'));
    expect(times).toEqual([{ position: 3, duration: 0 }]);
    expect(ended).toHaveBeenCalledOnce();
  });

  it('ignores the previous track events while a new load is pending', async () => {
    let releaseB = (_: StreamInfo) => {};
    const { audio, streams, engine } = make((id) =>
      id === 'b'
        ? new Promise<StreamInfo>((r) => {
            releaseB = r;
          })
        : Promise.resolve(info('https://s/a')),
    );
    await engine.load(t('a'));
    const ended = vi.fn();
    const times = vi.fn();
    engine.on('ended', ended);
    engine.on('time', times);
    const pending = engine.load(t('b'));
    audio.dispatchEvent(new Event('ended'));
    audio.dispatchEvent(new Event('timeupdate'));
    audio.dispatchEvent(new Event('error'));
    await flush();
    expect(ended).not.toHaveBeenCalled();
    expect(times).not.toHaveBeenCalled();
    expect(streams.resolve).toHaveBeenCalledTimes(2); // a, then b only
    expect(audio.pause).toHaveBeenCalled();
    releaseB(info('https://s/b'));
    await pending;
  });

  it('leaves the old audio paused when a load fails', async () => {
    const { audio, engine } = make((id) =>
      id === 'b' ? Promise.reject(new Error('boom')) : Promise.resolve(info('https://s/a')),
    );
    await engine.load(t('a'));
    await expect(engine.load(t('b'))).rejects.toThrow('boom');
    expect(audio.pause).toHaveBeenCalled();
  });

  it('does not restore the retry budget on playing alone', async () => {
    let n = 0;
    const { audio, engine, errors } = make(async () => info(`https://s/${++n}`));
    await engine.load(t('a'));
    audio.currentTime = 10;
    audio.dispatchEvent(new Event('error'));
    await flush();
    audio.dispatchEvent(new Event('playing'));
    audio.dispatchEvent(new Event('error'));
    await flush();
    expect(errors).toHaveLength(1);
    expect(n).toBe(2);
  });

  it('restores the retry budget after real progress', async () => {
    let n = 0;
    const { audio, engine, errors } = make(async () => info(`https://s/${++n}`));
    await engine.load(t('a'));
    audio.currentTime = 10;
    audio.dispatchEvent(new Event('error'));
    await flush();
    audio.currentTime = 30;
    audio.dispatchEvent(new Event('timeupdate'));
    audio.dispatchEvent(new Event('error'));
    await flush();
    expect(errors).toEqual([]);
    expect(n).toBe(3);
  });

  it('re-resolves an expired stream once when play() is called twice', async () => {
    let n = 0;
    const { audio, streams, engine } = make(async () =>
      info(`https://s/${++n}`, n === 1 ? Date.now() - 1 : Date.now() + 3_600_000),
    );
    await engine.load(t('a'));
    engine.play();
    engine.play();
    await flush();
    expect(streams.resolve).toHaveBeenCalledTimes(2);
    expect(audio.play).toHaveBeenCalledTimes(1);
  });
});
