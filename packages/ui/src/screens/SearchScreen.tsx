import { current, type Track } from '@breeze/core';
import { Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { EmptyState, ErrorState, RowsSkeleton } from '../components/States';
import { TrackRow } from '../components/TrackRow';
import { uniqueById } from '../format';
import { useAsync } from '../hooks/useAsync';
import { useDebounced } from '../hooks/useDebounced';
import { usePlayer } from '../player/PlayerContext';
import { useServices } from '../services';

export function SearchScreen({ debounceMs = 300 }: { debounceMs?: number }) {
  const { source } = useServices();
  const { player, state } = usePlayer();
  const [text, setText] = useState('');
  const query = useDebounced(text.trim(), debounceMs);
  const results = useAsync(query ? `search:${query}` : null, () => source.search(query, 'songs'));
  const inputRef = useRef<HTMLInputElement>(null);
  const playingId = current(state.queue)?.id;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <section className="screen" aria-labelledby="search-title">
      <h1 id="search-title" className="screen-title">
        Search
      </h1>
      <div className="search-box">
        <Search size={18} aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          aria-label="Search songs"
          placeholder="Search for a song or artist"
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
        />
      </div>
      {results.status === 'idle' && <EmptyState title="Find something to play" body="Type a song or artist name." />}
      {results.status === 'loading' && <RowsSkeleton />}
      {results.status === 'error' && <ErrorState error={results.error} onRetry={results.retry} />}
      {results.status === 'ready' &&
        (results.data.songs.length === 0 ? (
          <EmptyState
            title="No songs found"
            body={`Nothing matched “${query}”. Check the spelling or try fewer words.`}
          />
        ) : (
          <SongList
            songs={uniqueById(results.data.songs)}
            playingId={playingId}
            onPlay={(list, i) => void player.playTracks(list, i)}
          />
        ))}
    </section>
  );
}

function SongList({
  songs,
  playingId,
  onPlay,
}: {
  songs: Track[];
  playingId: string | undefined;
  onPlay: (list: Track[], index: number) => void;
}) {
  return (
    <div className="track-list">
      {songs.map((track, i) => (
        <TrackRow key={track.id} track={track} active={track.id === playingId} onPlay={() => onPlay(songs, i)} />
      ))}
    </div>
  );
}
