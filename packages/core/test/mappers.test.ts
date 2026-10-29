import { describe, expect, it } from 'vitest';
import { mapHomeItem, mapThumbs, mapTrack, type RawItem } from '../src/mappers';

const text = (s: string) => ({ toString: () => s });

const song: RawItem = {
  id: 'abc123',
  item_type: 'song',
  title: text('Get Lucky'),
  artists: [{ name: 'Daft Punk', channel_id: 'UCdp' }],
  album: { id: 'MPREb_x', name: 'Random Access Memories' },
  duration: { seconds: 248 },
  thumbnail: { contents: [{ url: 'https://i/1.jpg', width: 60, height: 60 }] },
};

describe('mapTrack', () => {
  it('maps a full song', () => {
    expect(mapTrack(song)).toEqual({
      id: 'abc123',
      title: 'Get Lucky',
      artists: [{ id: 'UCdp', name: 'Daft Punk' }],
      album: { id: 'MPREb_x', name: 'Random Access Memories' },
      durationSec: 248,
      thumbnails: [{ url: 'https://i/1.jpg', width: 60, height: 60 }],
    });
  });

  it('maps a bare music video with no album, duration or thumbnails', () => {
    const t = mapTrack({ id: 'v1', item_type: 'video', title: 'Live set', author: { name: 'DJ' } });
    expect(t).toEqual({
      id: 'v1',
      title: 'Live set',
      artists: [{ id: undefined, name: 'DJ' }],
      album: undefined,
      durationSec: undefined,
      thumbnails: [],
    });
  });

  it('uses video_id for up-next items', () => {
    expect(mapTrack({ video_id: 'q9', title: 'x' })?.id).toBe('q9');
  });

  it('returns null without an id', () => {
    expect(mapTrack({ title: 'orphan' })).toBeNull();
  });

  it('gives an empty artist list when nothing is known', () => {
    expect(mapTrack({ id: 'z' })?.artists).toEqual([]);
  });
});

describe('mapThumbs', () => {
  it('accepts a plain array, a contents wrapper, or thumbnails', () => {
    expect(mapThumbs({ thumbnail: [{ url: 'a' }] })).toEqual([{ url: 'a', width: 0, height: 0 }]);
    expect(mapThumbs({ thumbnail: { contents: [{ url: 'b', width: 1, height: 2 }] } })).toHaveLength(1);
    expect(mapThumbs({ thumbnails: [{ url: 'c' }] })[0]?.url).toBe('c');
    expect(mapThumbs(undefined)).toEqual([]);
  });

  it('drops entries without a url', () => {
    expect(mapThumbs({ thumbnails: [{ url: '' }] })).toEqual([]);
  });
});

describe('mapHomeItem', () => {
  it.each([
    ['song', 'track'],
    ['video', 'track'],
    ['album', 'album'],
    ['artist', 'artist'],
    ['playlist', 'playlist'],
  ])('maps item_type %s to kind %s', (item_type, kind) => {
    expect(mapHomeItem({ id: 'x', item_type, title: 'T', name: 'N' })?.kind).toBe(kind);
  });

  it('returns null for unknown types or missing ids', () => {
    expect(mapHomeItem({ id: 'x', item_type: 'podcast_show' })).toBeNull();
    expect(mapHomeItem({ item_type: 'album' })).toBeNull();
  });

  it('fills album year and artist name', () => {
    expect(mapHomeItem({ id: 'a', item_type: 'album', title: 'RAM', year: '2013' })).toEqual({
      kind: 'album',
      album: { id: 'a', title: 'RAM', year: '2013', thumbnails: [] },
    });
    expect(mapHomeItem({ id: 'r', item_type: 'artist', name: text('Daft Punk') })).toEqual({
      kind: 'artist',
      artist: { id: 'r', name: 'Daft Punk', thumbnails: [] },
    });
  });
});
