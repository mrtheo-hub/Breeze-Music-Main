import { MemoryStorage, type MusicSource, SourceError } from '@breeze/core';
import type { StreamInfo } from '@breeze/core/stream';
import { describe, expect, it, vi } from 'vitest';
import { type IpcHandle, registerIpc } from '../src/main/ipc';
import { createServices, type Factories } from '../src/main/services';
import { ipcSource, ipcStorage, ipcStreams } from '../src/renderer/src/ipc-adapters';
import { type BreezeApi, channel, METHOD_NAMES, type Methods } from '../src/shared/ipc';

const track = { id: 'a', title: 'A', artists: [], thumbnails: [] };
const stream: StreamInfo = { url: 'https://x', mimeType: 'audio/mp4', bitrate: 1, expiresAt: 2 };

function source(over: Partial<MusicSource> = {}): MusicSource {
  const missing = () => Promise.reject(new Error('not stubbed'));
  return {
    home: missing,
    search: missing,
    track: async () => track,
    album: missing,
    artist: missing,
    playlist: missing,
    upNext: missing,
    ...over,
  };
}

const factories = (src: MusicSource = source()): Factories => ({
  source: async () => src,
  streams: async () => ({ resolve: async () => stream }),
});

/** Wire main handlers to a renderer-side api, cloning like Electron's structured clone. */
function connect(impl: Methods): { api: BreezeApi; handlers: Map<string, (...a: unknown[]) => unknown> } {
  const handlers = new Map<string, (...a: unknown[]) => unknown>();
  const ipc: IpcHandle = {
    handle: (c, h) => {
      handlers.set(c, h);
    },
  };
  registerIpc(ipc, impl);
  const api = Object.fromEntries(
    METHOD_NAMES.map((name) => [
      name,
      async (...args: unknown[]) => structuredClone(await handlers.get(channel(name))?.({}, ...structuredClone(args))),
    ]),
  ) as BreezeApi;
  return { api, handlers };
}

describe('IPC contract', () => {
  it('registers one handler per method', () => {
    const { handlers } = connect(createServices(new MemoryStorage(), factories()));
    expect(handlers.size).toBe(METHOD_NAMES.length);
  });

  it('round-trips source, storage and stream calls', async () => {
    const { api } = connect(createServices(new MemoryStorage(), factories()));
    expect(await ipcSource(api).track('a')).toEqual(track);
    await ipcStorage(api).addHistory(track);
    expect(await ipcStorage(api).getHistory(5)).toEqual([track]);
    expect(await ipcStreams(api).resolve('a', 'high')).toEqual(stream);
  });

  it('keeps the SourceError kind across the process boundary', async () => {
    const failing = source({
      search: async () => {
        throw new Error('Request to https://x failed with status code 429');
      },
    });
    const { api } = connect(createServices(new MemoryStorage(), factories(failing)));
    const err = await ipcSource(api)
      .search('x')
      .catch((e) => e);
    expect(err).toBeInstanceOf(SourceError);
    expect(err.kind).toBe('blocked');
    expect(err.message).toContain('429');
  });

  it('preserves `this` for class-based implementations', async () => {
    class Impl {
      private readonly secret = 'kept';
      async track() {
        return { ...track, title: this.secret };
      }
    }
    const impl = new Impl();
    const { api } = connect(createServices(new MemoryStorage(), factories(source({ track: () => impl.track() }))));
    expect((await ipcSource(api).track('a')).title).toBe('kept');
  });
});

describe('createServices', () => {
  it('connects once and reuses the connection', async () => {
    const make = vi.fn(async () => source());
    const svc = createServices(new MemoryStorage(), { ...factories(), source: make });
    await svc.track('a');
    await svc.track('a');
    expect(make).toHaveBeenCalledTimes(1);
  });

  it('retries the connection after a failed start', async () => {
    const make = vi
      .fn<() => Promise<MusicSource>>()
      .mockRejectedValueOnce(new SourceError('network', 'offline'))
      .mockResolvedValue(source());
    const svc = createServices(new MemoryStorage(), { ...factories(), source: make });
    await expect(svc.track('a')).rejects.toMatchObject({ kind: 'network' });
    expect(await svc.track('a')).toEqual(track);
    expect(make).toHaveBeenCalledTimes(2);
  });
});
