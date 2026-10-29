import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlayerProvider, usePlayer } from '../src/player/PlayerContext';
import { useMediaSession } from '../src/player/useMediaSession';
import { flush, setup, t } from './helpers';

describe('useMediaSession', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('publishes metadata and wires OS media keys', async () => {
    const handlers = new Map<string, ((d: { seekTime?: number }) => void) | null>();
    const session = {
      metadata: null as unknown,
      playbackState: 'none',
      setActionHandler: (action: string, h: ((d: { seekTime?: number }) => void) | null) => handlers.set(action, h),
    };
    Object.defineProperty(navigator, 'mediaSession', { value: session, configurable: true });
    vi.stubGlobal(
      'MediaMetadata',
      class {
        constructor(public init: { title: string; artist: string }) {}
      },
    );
    const ctx = setup();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <PlayerProvider controller={ctx.player}>{children}</PlayerProvider>
    );
    renderHook(
      () => {
        const { player, state } = usePlayer();
        useMediaSession(player, state);
      },
      { wrapper },
    );

    await act(() => ctx.player.playTracks([t('a'), t('b')]));
    expect((session.metadata as { init: { title: string } }).init.title).toBe('Song a');
    expect(session.playbackState).toBe('playing');

    await act(async () => {
      handlers.get('nexttrack')?.({});
      await flush();
    });
    expect(ctx.engine.loaded).toEqual(['a', 'b']);
  });
});
