import { current } from '@breeze/core';
import { describe, expect, it, vi } from 'vitest';
import { flush, setup, t } from './helpers';

describe('PlayerController', () => {
  it('plays the chosen track and records history', async () => {
    const { engine, storage, player } = setup();
    await player.playTracks([t('a'), t('b')], 1);
    expect(engine.loaded).toEqual(['b']);
    expect(engine.plays).toEqual(['b']);
    expect(player.getState().status).toBe('playing');
    await flush();
    expect((await storage.getHistory(5)).map((x) => x.id)).toEqual(['b']);
  });

  it('advances when a track ends', async () => {
    const { engine, player } = setup();
    await player.playTracks([t('a'), t('b')]);
    engine.events.emit('ended', undefined);
    await flush();
    expect(engine.loaded).toEqual(['a', 'b']);
  });

  it('repeat one restarts the same track without reloading', async () => {
    const { engine, player } = setup();
    await player.playTracks([t('a'), t('b')]);
    player.cycleRepeat(); // all
    player.cycleRepeat(); // one
    engine.events.emit('ended', undefined);
    await flush();
    expect(engine.loaded).toEqual(['a']);
    expect(engine.seeks).toEqual([0]);
  });

  it('continues with up-next tracks when the queue ends and autoplay is on', async () => {
    const upNext = vi.fn(async () => [t('x'), t('y')]);
    const { engine, player } = setup({ source: { upNext } });
    await player.playTracks([t('a')]);
    engine.events.emit('ended', undefined);
    await flush();
    expect(upNext).toHaveBeenCalledWith('a');
    expect(engine.loaded).toEqual(['a', 'x']);
  });

  it('stops at the end when autoplay is off', async () => {
    const upNext = vi.fn(async () => [t('x')]);
    const { engine, player } = setup({ source: { upNext }, autoplay: false });
    await player.playTracks([t('a')]);
    engine.events.emit('ended', undefined);
    await flush();
    expect(upNext).not.toHaveBeenCalled();
    expect(player.getState().status).toBe('paused');
  });

  it('shows an error and stops when up-next fails', async () => {
    const { engine, player } = setup({
      source: {
        upNext: async () => {
          throw new Error('fetch failed');
        },
      },
    });
    await player.playTracks([t('a')]);
    engine.events.emit('ended', undefined);
    await flush();
    expect(player.getState().error).toMatch(/connection/i);
    expect(player.getState().status).toBe('paused');
  });

  it('skips a track that fails to load and says why', async () => {
    const { engine, player } = setup();
    engine.failIds.add('a');
    await player.playTracks([t('a'), t('b')]);
    expect(engine.loaded).toEqual(['a', 'b']);
    expect(engine.plays).toEqual(['b']);
    expect(player.getState().error).toMatch(/limiting/i);
  });

  it('stops after 3 consecutive failures', async () => {
    const { engine, player } = setup();
    for (const id of ['a', 'b', 'c', 'd']) engine.failIds.add(id);
    await player.playTracks([t('a'), t('b'), t('c'), t('d')]);
    expect(engine.loaded).toEqual(['a', 'b', 'c']);
    expect(player.getState().status).toBe('paused');
  });

  it('only the last of several rapid clicks plays', async () => {
    const { engine, player } = setup();
    let release = () => {};
    engine.gates.set(
      'slow',
      new Promise<void>((r) => {
        release = r;
      }),
    );
    const first = player.playTracks([t('slow')]);
    await player.playTracks([t('fast')]);
    release();
    await first;
    expect(engine.plays).toEqual(['fast']);
    expect(current(player.getState().queue)?.id).toBe('fast');
  });

  it('ignores resume and playPause while a load is pending', async () => {
    const { engine, player } = setup();
    let release = () => {};
    engine.gates.set(
      'b',
      new Promise<void>((r) => {
        release = r;
      }),
    );
    const loading = player.playTracks([t('b')]);
    player.resume();
    player.playPause();
    expect(engine.plays).toEqual([]);
    release();
    await loading;
    expect(engine.plays).toEqual(['b']);
  });

  it('prev restarts the track after 3 s, otherwise goes back', async () => {
    const { engine, player } = setup();
    await player.playTracks([t('a'), t('b')], 1);
    engine.events.emit('time', { position: 10, duration: 200 });
    await player.prev();
    expect(engine.seeks).toEqual([0]);
    engine.events.emit('time', { position: 1, duration: 200 });
    await player.prev();
    expect(engine.loaded).toEqual(['b', 'a']);
  });

  it('clamps volume and toggles mute back to the last level', () => {
    const { engine, player } = setup();
    player.setVolume(1.7);
    expect(engine.volume).toBe(1);
    player.setVolume(0.3);
    player.toggleMute();
    expect(player.getState().volume).toBe(0);
    player.toggleMute();
    expect(player.getState().volume).toBe(0.3);
  });

  it('cycles repeat off -> all -> one -> off', () => {
    const { player } = setup();
    const seen = [1, 2, 3].map(() => {
      player.cycleRepeat();
      return player.getState().queue.repeat;
    });
    expect(seen).toEqual(['all', 'one', 'off']);
  });

  it('notifies subscribers and stops after unsubscribe', () => {
    const { player } = setup();
    const listener = vi.fn();
    const off = player.subscribe(listener);
    player.toggleShuffle();
    off();
    player.toggleShuffle();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('drops up-next results when a newer track was chosen meanwhile', async () => {
    let resolveUpNext = (_: ReturnType<typeof t>[]) => {};
    const upNext = vi.fn(
      () =>
        new Promise<ReturnType<typeof t>[]>((r) => {
          resolveUpNext = r;
        }),
    );
    const { engine, player } = setup({ source: { upNext } });
    await player.playTracks([t('a')]);
    engine.events.emit('ended', undefined);
    await player.playTracks([t('z')]);
    resolveUpNext([t('x')]);
    await flush();
    expect(engine.loaded).toEqual(['a', 'z']);
    expect(player.getState().queue.tracks.map((x) => x.id)).toEqual(['z']);
  });

  it('ignores an engine error that arrives while a newer load is pending', async () => {
    const { engine, player } = setup();
    let release = () => {};
    engine.gates.set(
      'b',
      new Promise<void>((r) => {
        release = r;
      }),
    );
    const loading = player.playTracks([t('b'), t('c')]);
    engine.events.emit('error', new Error('late error from previous track'));
    release();
    await loading;
    expect(engine.plays).toEqual(['b']);
    expect(engine.loaded).toEqual(['b']);
    expect(player.getState().error).toBeNull();
  });

  it('handles an engine error that arrives after load but before playing', async () => {
    const { engine, player } = setup();
    engine.silentPlay = true;
    await player.playTracks([t('a'), t('b')]);
    engine.events.emit('error', new Error('Request to https://x failed with status code 403'));
    await flush();
    expect(player.getState().error).toMatch(/limiting/i);
    expect(engine.loaded).toEqual(['a', 'b']);
  });

  it('drops an up-next failure when a newer track was chosen meanwhile', async () => {
    let rejectUpNext = (_: Error) => {};
    const upNext = vi.fn(
      () =>
        new Promise<ReturnType<typeof t>[]>((_, reject) => {
          rejectUpNext = reject;
        }),
    );
    const { engine, player } = setup({ source: { upNext } });
    await player.playTracks([t('a')]);
    engine.events.emit('ended', undefined);
    await player.playTracks([t('z')]);
    rejectUpNext(new Error('fetch failed'));
    await flush();
    expect(player.getState().error).toBeNull();
    expect(player.getState().status).toBe('playing');
    expect(engine.plays).toEqual(['a', 'z']);
  });
});
