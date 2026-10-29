import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { InnerTubeSource, type MusicClient } from '../src/innertube';

const load = (name: string): any =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const meta = load('meta');

const client: MusicClient = {
  search: async () => load('search'),
  getHomeFeed: async () => load('home'),
  getInfo: async () => load('info'),
  getAlbum: async () => load('album'),
  getArtist: async () => load('artist'),
  getPlaylist: async () => ({}),
  getUpNext: async () => load('upnext'),
};
const src = new InnerTubeSource(client);

/** A real label: not empty, not youtubei.js's "N/A", not a stringified object. */
const real = (s: string | undefined) => !!s && s !== 'N/A' && !s.includes('[object Object]');

describe('mappers against captured YouTube Music data', () => {
  it('search', async () => {
    const r = await src.search(meta.query);
    expect(r.songs.length).toBeGreaterThan(0);
    for (const s of r.songs) {
      expect(s.id).toBeTruthy();
      expect(real(s.title)).toBe(true);
    }
    expect(r.songs.some((s) => s.artists.length > 0)).toBe(true);
    expect(r.albums.length).toBeGreaterThan(0);
    for (const a of r.albums) expect(real(a.title)).toBe(true);
    for (const a of r.artists) expect(real(a.name)).toBe(true);
  });

  it('home', async () => {
    const home = await src.home();
    expect(home.length).toBeGreaterThan(0);
    for (const s of home) {
      expect(real(s.title)).toBe(true);
      expect(s.items.length).toBeGreaterThan(0);
    }
  });

  it('album', async () => {
    const a = await src.album(meta.albumId);
    expect(real(a.title)).toBe(true);
    expect(real(a.artists[0]?.name)).toBe(true);
    expect(a.tracks.length).toBeGreaterThan(0);
    for (const t of a.tracks) {
      expect(t.album?.name).toBe(a.title);
      expect(t.artists.length).toBeGreaterThan(0);
    }
  });

  it('artist', async () => {
    const a = await src.artist(meta.artistId);
    expect(real(a.name)).toBe(true);
    expect(a.topTracks.length).toBeGreaterThan(0);
  });

  it('up next excludes the seed', async () => {
    const list = await src.upNext(meta.songId);
    expect(list.length).toBeGreaterThan(0);
    expect(list.some((t) => t.id === meta.songId)).toBe(false);
  });

  it('track', async () => {
    const t = await src.track(meta.songId);
    expect(real(t.title)).toBe(true);
    expect(t.durationSec).toBeGreaterThan(0);
    expect(t.thumbnails.length).toBeGreaterThan(0);
  });
});
