import { current } from '@breeze/core';
import { Loader2, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { artistNames, formatTime } from '../format';
import { usePlayer } from '../player/PlayerContext';
import { Artwork } from './Artwork';

export function PlayerBar() {
  const { state, player } = usePlayer();
  const track = current(state.queue);
  const { repeat, shuffled } = state.queue;
  const playing = state.status === 'playing';
  const RepeatIcon = repeat === 'one' ? Repeat1 : Repeat;

  return (
    <section className="player-bar" aria-label="Player">
      <div className="now-playing">
        {track ? (
          <>
            <Artwork thumbnails={track.thumbnails} size={48} className="np-art" />
            <div className="np-text">
              <span className="np-title">{track.title || 'Untitled'}</span>
              <span className="np-artist">{artistNames(track.artists)}</span>
            </div>
          </>
        ) : (
          <span className="np-empty">Nothing playing</span>
        )}
      </div>

      <div className="transport">
        <div className="transport-buttons">
          <button
            type="button"
            className="icon-btn"
            aria-label="Shuffle"
            aria-pressed={shuffled}
            onClick={() => player.toggleShuffle()}
          >
            <Shuffle size={18} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Previous"
            disabled={!track}
            onClick={() => void player.prev()}
          >
            <SkipBack size={20} />
          </button>
          <button
            type="button"
            className="icon-btn play-btn"
            aria-label={playing ? 'Pause' : 'Play'}
            disabled={!track}
            onClick={() => player.playPause()}
          >
            {state.status === 'loading' ? (
              <Loader2 size={22} className="spin" />
            ) : playing ? (
              <Pause size={22} />
            ) : (
              <Play size={22} />
            )}
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Next"
            disabled={!track}
            onClick={() => void player.next()}
          >
            <SkipForward size={20} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={`Repeat: ${repeat}`}
            aria-pressed={repeat !== 'off'}
            onClick={() => player.cycleRepeat()}
          >
            <RepeatIcon size={18} />
          </button>
        </div>
        <div className="seek">
          <span className="time">{formatTime(state.position)}</span>
          <input
            type="range"
            aria-label="Seek"
            min={0}
            max={Math.max(state.duration, 1)}
            step={1}
            value={Math.min(state.position, state.duration)}
            disabled={!track || state.duration === 0}
            onChange={(e) => player.seek(Number(e.currentTarget.value))}
          />
          <span className="time">{formatTime(state.duration)}</span>
        </div>
      </div>

      <div className="volume">
        <button
          type="button"
          className="icon-btn"
          aria-label={state.volume === 0 ? 'Unmute' : 'Mute'}
          onClick={() => player.toggleMute()}
        >
          {state.volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
        <input
          type="range"
          aria-label="Volume"
          min={0}
          max={1}
          step={0.01}
          value={state.volume}
          onChange={(e) => player.setVolume(Number(e.currentTarget.value))}
        />
      </div>
    </section>
  );
}
