import { current } from '@breeze/core';
import { useEffect } from 'react';
import { artistNames } from '../format';
import type { PlayerController, PlayerState } from './controller';

/** Windows media keys and the system media overlay, via the Media Session API. */
export function useMediaSession(player: PlayerController, state: PlayerState): void {
  const track = current(state.queue);

  useEffect(() => {
    const session = navigator.mediaSession;
    if (!session) return;
    const actions: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => player.resume()],
      ['pause', () => player.pause()],
      ['previoustrack', () => void player.prev()],
      ['nexttrack', () => void player.next()],
      [
        'seekto',
        (details) => {
          if (details.seekTime != null) player.seek(details.seekTime);
        },
      ],
    ];
    for (const [action, handler] of actions) session.setActionHandler(action, handler);
    return () => {
      for (const [action] of actions) session.setActionHandler(action, null);
    };
  }, [player]);

  useEffect(() => {
    const session = navigator.mediaSession;
    if (!session || typeof MediaMetadata === 'undefined') return;
    session.metadata = track
      ? new MediaMetadata({
          title: track.title,
          artist: artistNames(track.artists),
          album: track.album?.name ?? '',
          artwork: track.thumbnails
            .filter((t) => t.width > 0)
            .map((t) => ({ src: t.url, sizes: `${t.width}x${t.height}` })),
        })
      : null;
  }, [track]);

  useEffect(() => {
    const session = navigator.mediaSession;
    if (!session) return;
    session.playbackState = state.status === 'playing' ? 'playing' : state.status === 'idle' ? 'none' : 'paused';
  }, [state.status]);
}
