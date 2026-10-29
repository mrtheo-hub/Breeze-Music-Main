import { describe, expect, it, vi } from 'vitest';
import { SourceError } from '../src/errors';
import { InnerTubeSource, type MusicClient } from '../src/innertube';

function fakeClient(over: Partial<MusicClient> = {}): MusicClient {
  const none = vi.fn(async () => ({}));
  return {
    search: none,
    getHomeFeed: none,
    getInfo: none,
    getAlbum: none,
    getArtist: none,
    getPlaylist: none,
    getUpNext: none,
    ...over,
  };
}

const song = { id: 's1', item_type: 'song', title: 'Song', artists: [{ name: 'A' }] };
const video = { id: 'v1', item_type: 'video', title: 'Video', author: { name: 'B' } };
const album = { id: 'al1', item_type: 'album', title: 'Album' };
const artist = { id: 'ar1', item_type: 'artist', name: 'Artist' };
const playlist = { id: 'pl1', item_type: 'playlist', title: 'Mix' };

describe('InnerTubeSource.search', () => {
  it('returns empty results for a blank query without calling YouTube', async () => {
    const search = vi.fn();
    const src = new InnerTubeSource(fakeClient({ search }));
    expect(await src.search('   ')).toEqual({ songs: [], albums: [], artists: [], playlists: [] });
    expect(search).not.toHaveBeenCalled();
  });

  it('flattens all shelves and groups by item type', async () => {
    const search = vi.fn(async () => ({
      contents: [{ contents: [song, album] }, { contents: [artist, playlist, video, { item_type: 'song' }] }, {}],
    }));
    const r = await new InnerTubeSource(fakeClient({ search })).search(' daft punk ');
    expect(search).toHaveBeenCalledWith('daft punk', undefined);
    expect(r.songs.map((s) => s.id)).toEqual(['s1', 'v1']);
    expect(r.albums.map((a) => a.id)).toEqual(['al1']);
    expect(r.artists.map((a) => a.id)).toEqual(['ar1']);
    expect(r.playlists.map((p) => p.id)).toEqual(['pl1']);
  });

  it('passes the filter as a youtubei.js type', async () => {
    const search = vi.fn(async () => ({ contents: [] }));
    await new InnerTubeSource(fakeClient({ search })).search('x', 'albums');
    expect(search).toHaveBeenCalledWith('x', { type: 'album' });
  });

  it('wraps client failures in SourceError', async () => {
    const search = vi.fn(async () => {
      throw new Error('Request failed with status 429');
    });
    const err = await new InnerTubeSource(fakeClient({ search })).search('x').catch((e) => e);
    expect(err).toBeInstanceOf(SourceError);
    expect(err.kind).toBe('blocked');
  });
});

describe('InnerTubeSource pages', () => {
  it('home keeps titled sections with at least one item', async () => {
    const getHomeFeed = vi.fn(async () => ({
      sections: [
        { header: { title: 'Quick picks' }, contents: [song] },
        { header: { title: 'Empty' }, contents: [] },
      ],
    }));
    const home = await new InnerTubeSource(fakeClient({ getHomeFeed })).home();
    expect(home).toEqual([{ title: 'Quick picks', items: [expect.objectContaining({ kind: 'track' })] }]);
  });

  it('track maps basic_info', async () => {
    const getInfo = vi.fn(async () => ({
      basic_info: { id: 't1', title: 'T', author: 'A', channel_id: 'UCa', duration: 200, thumbnail: [{ url: 'u' }] },
    }));
    expect(await new InnerTubeSource(fakeClient({ getInfo })).track('t1')).toEqual({
      id: 't1',
      title: 'T',
      artists: [{ id: 'UCa', name: 'A' }],
      album: undefined,
      durationSec: 200,
      thumbnails: [{ url: 'u', width: 0, height: 0 }],
    });
  });

  it('track throws not_found when YouTube returns nothing', async () => {
    const err = await new InnerTubeSource(fakeClient()).track('gone').catch((e) => e);
    expect(err.kind).toBe('not_found');
  });

  it('album fills album ref and cover into tracks and parses the year', async () => {
    const getAlbum = vi.fn(async () => ({
      header: { title: 'RAM', subtitle: 'Album • 2013', thumbnail: { contents: [{ url: 'cover' }] } },
      contents: [{ id: 'x1', title: 'One', artists: [{ name: 'Daft Punk' }] }],
    }));
    const a = await new InnerTubeSource(fakeClient({ getAlbum })).album('al1');
    expect(a.year).toBe('2013');
    expect(a.artists).toEqual([{ id: undefined, name: 'Daft Punk' }]);
    expect(a.tracks[0]?.album).toEqual({ id: 'al1', name: 'RAM' });
    expect(a.tracks[0]?.thumbnails[0]?.url).toBe('cover');
  });

  it('album takes the artist from strapline_text_one and fills tracks that lack artists', async () => {
    const getAlbum = vi.fn(async () => ({
      header: { title: 'RAM', strapline_text_one: 'Daft Punk', subtitle: 'Album • 2013' },
      contents: [{ id: 'x1', title: 'One' }],
    }));
    const a = await new InnerTubeSource(fakeClient({ getAlbum })).album('al1');
    expect(a.artists).toEqual([{ name: 'Daft Punk' }]);
    expect(a.tracks[0]?.artists).toEqual([{ name: 'Daft Punk' }]);
  });

  it('artist splits top tracks and albums across sections', async () => {
    const getArtist = vi.fn(async () => ({
      header: { title: 'Daft Punk' },
      sections: [{ contents: [song, video] }, { contents: [album] }],
    }));
    const a = await new InnerTubeSource(fakeClient({ getArtist })).artist('ar1');
    expect(a.name).toBe('Daft Punk');
    expect(a.topTracks.map((t) => t.id)).toEqual(['s1', 'v1']);
    expect(a.albums.map((x) => x.id)).toEqual(['al1']);
  });

  it('playlist reads items', async () => {
    const getPlaylist = vi.fn(async () => ({ header: { title: 'Mix', author: { name: 'Me' } }, items: [song] }));
    const p = await new InnerTubeSource(fakeClient({ getPlaylist })).playlist('pl1');
    expect(p).toMatchObject({ id: 'pl1', title: 'Mix', author: 'Me' });
    expect(p.tracks).toHaveLength(1);
  });

  it('upNext drops the seed track', async () => {
    const getUpNext = vi.fn(async () => ({ contents: [{ video_id: 'seed', title: 'S' }, { video_id: 'n1', title: 'N' }] }));
    const list = await new InnerTubeSource(fakeClient({ getUpNext })).upNext('seed');
    expect(list.map((t) => t.id)).toEqual(['n1']);
  });
});
