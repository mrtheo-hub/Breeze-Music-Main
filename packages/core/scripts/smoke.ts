// Manual check against live YouTube Music. Not run in CI.
import { InnerTubeSource } from '../src/innertube';
import { fetchLyrics } from '../src/lyrics';

const src = await InnerTubeSource.create();

const home = await src.home();
console.log(
  'home sections:',
  home.length,
  home.map((s) => `${s.title} (${s.items.length})`).slice(0, 5),
);

const result = await src.search('daft punk get lucky');
console.log('search:', {
  songs: result.songs.length,
  albums: result.albums.length,
  artists: result.artists.length,
  playlists: result.playlists.length,
});
const song = result.songs[0];
if (!song) {
  console.error('FAIL: no songs returned');
  process.exit(1);
}
console.log('first song:', song);

console.log('track:', await src.track(song.id));
console.log(
  'up next:',
  (await src.upNext(song.id)).slice(0, 3).map((t) => t.title),
);

const albumId = result.albums[0]?.id ?? song.album?.id;
if (albumId) {
  const album = await src.album(albumId);
  console.log('album:', album.title, album.year, album.artists, `${album.tracks.length} tracks`);
}

const artistId = result.artists[0]?.id ?? song.artists[0]?.id;
if (artistId) {
  const artist = await src.artist(artistId);
  console.log('artist:', artist.name, `${artist.topTracks.length} top tracks`, `${artist.albums.length} albums`);
}

try {
  const lyrics = await fetchLyrics({
    title: song.title,
    artist: song.artists[0]?.name ?? '',
    album: song.album?.name,
    durationSec: song.durationSec,
  });
  console.log('lyrics:', lyrics.synced ? `${lyrics.synced.length} synced lines` : lyrics.plain ? 'plain only' : 'none');
} catch (e) {
  // LRCLIB is a third-party service; report, don't fail the YouTube smoke.
  console.log('lyrics: request failed', (e as { kind?: string }).kind, (e as Error).message);
}
