// Saves real youtubei.js results as JSON fixtures for the mapper tests.
// Hits live YouTube, run by hand: pnpm --filter @breeze/core capture
import { mkdir, writeFile } from 'node:fs/promises';
import { Innertube } from 'youtubei.js';

const QUERY = 'daft punk get lucky';
const OUT = new URL('../test/fixtures/', import.meta.url);
// Fields the mappers never read. Dropping them keeps fixtures small and avoids cycles.
const DROP = new Set([
  'actions',
  'session',
  'endpoint',
  'menu',
  'overlay',
  'buttons',
  'badges',
  'navigation_endpoint',
  'on_tap',
  'flex_columns',
  'fixed_columns',
]);

function plain(value: unknown): unknown {
  const seen = new WeakSet<object>();
  return JSON.parse(
    JSON.stringify(value, (key, v) => {
      if (DROP.has(key)) return undefined;
      if (v && typeof v === 'object') {
        if (seen.has(v)) return undefined;
        seen.add(v);
      }
      return v;
    }),
  );
}

async function save(name: string, value: unknown): Promise<void> {
  await writeFile(new URL(`${name}.json`, OUT), `${JSON.stringify(plain(value), null, 1)}\n`);
  console.log('saved', name);
}

const yt = await Innertube.create();
await mkdir(OUT, { recursive: true });

const search: any = await yt.music.search(QUERY);
const shelves: any[] = search.contents ?? [];
const items: any[] = shelves.flatMap((s) => s?.contents ?? []);
const songId = items.find((i) => i?.item_type === 'song')?.id;
const albumId = items.find((i) => i?.item_type === 'album')?.id;
const artistId = items.find((i) => i?.item_type === 'artist')?.id;
if (!songId || !albumId || !artistId) throw new Error(`search for "${QUERY}" lacked a song, album or artist`);

await save('search', { contents: shelves.map((s) => ({ contents: s?.contents })) });
const home: any = await yt.music.getHomeFeed();
await save('home', {
  sections: (home.sections ?? []).map((s: any) => ({ header: s?.header, title: s?.title, contents: s?.contents })),
});
const album: any = await yt.music.getAlbum(albumId);
await save('album', { header: album.header, contents: album.contents });
const artist: any = await yt.music.getArtist(artistId);
await save('artist', {
  header: artist.header,
  sections: (artist.sections ?? []).map((s: any) => ({ contents: s?.contents })),
});
const upNext: any = await yt.music.getUpNext(songId);
await save('upnext', { contents: upNext.contents });
const info: any = await yt.music.getInfo(songId);
await save('info', { basic_info: info.basic_info });
await save('meta', { query: QUERY, songId, albumId, artistId, capturedAt: new Date().toISOString() });
