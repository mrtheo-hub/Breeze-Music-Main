import type { Track } from '@breeze/core';
import { artistNames, formatTime } from '../format';
import { Artwork } from './Artwork';

export interface TrackRowProps {
  track: Track;
  active?: boolean;
  onPlay: () => void;
}

export function TrackRow({ track, active = false, onPlay }: TrackRowProps) {
  return (
    <button
      type="button"
      className="track-row"
      data-active={active || undefined}
      aria-current={active ? 'true' : undefined}
      onClick={onPlay}
    >
      <Artwork thumbnails={track.thumbnails} size={40} className="track-art" />
      <span className="track-text">
        <span className="track-title">{track.title || 'Untitled'}</span>
        <span className="track-artist">{artistNames(track.artists)}</span>
      </span>
      <span className="track-duration">{track.durationSec ? formatTime(track.durationSec) : ''}</span>
    </button>
  );
}
