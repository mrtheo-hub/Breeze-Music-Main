import { current, type HomeSection } from '@breeze/core';
import { EmptyState, ErrorState, RowsSkeleton } from '../components/States';
import { TrackRow } from '../components/TrackRow';
import { uniqueById } from '../format';
import { useAsync } from '../hooks/useAsync';
import { usePlayer } from '../player/PlayerContext';
import { useServices } from '../services';

export function HomeScreen() {
  const { source } = useServices();
  const home = useAsync('home', () => source.home());
  return (
    <section className="screen" aria-labelledby="home-title">
      <h1 id="home-title" className="screen-title">
        Home
      </h1>
      {home.status === 'loading' && <RowsSkeleton />}
      {home.status === 'error' && <ErrorState error={home.error} onRetry={home.retry} />}
      {home.status === 'ready' && <Shelves sections={home.data} />}
    </section>
  );
}

/** Plan 2 plays songs only; album, artist and playlist cards arrive with their pages in Plan 3. */
function Shelves({ sections }: { sections: HomeSection[] }) {
  const { player, state } = usePlayer();
  const playingId = current(state.queue)?.id;
  const shelves = sections
    .map((s) => ({ title: s.title, tracks: uniqueById(s.items.flatMap((i) => (i.kind === 'track' ? [i.track] : []))) }))
    .filter((s) => s.tracks.length > 0);

  if (shelves.length === 0) {
    return <EmptyState title="Nothing here yet" body="Your home feed has no songs right now. Try Search." />;
  }
  return (
    <>
      {shelves.map((shelf) => (
        <section key={`${shelf.title}:${shelf.tracks[0]?.id}`} className="shelf">
          <h2 className="shelf-title">{shelf.title}</h2>
          <div className="track-grid">
            {shelf.tracks.map((track, i) => (
              <TrackRow
                key={track.id}
                track={track}
                active={track.id === playingId}
                onPlay={() => void player.playTracks(shelf.tracks, i)}
              />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
