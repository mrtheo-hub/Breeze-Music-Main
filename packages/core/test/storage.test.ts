import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, HISTORY_LIMIT, MemoryStorage, pushHistory } from '../src/storage';
import type { LocalPlaylist, Track } from '../src/types';

const t = (id: string): Track => ({ id, title: id, artists: [], thumbnails: [] });
const pl = (id: string, createdAt: number): LocalPlaylist => ({
  id,
  name: id,
  tracks: [],
  createdAt,
  updatedAt: createdAt,
});

describe('pushHistory', () => {
  it('puts the newest first and removes the older duplicate', () => {
    expect(pushHistory([t('a'), t('b')], t('b')).map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('caps at the limit', () => {
    const many = Array.from({ length: HISTORY_LIMIT }, (_, i) => t(String(i)));
    const out = pushHistory(many, t('new'));
    expect(out).toHaveLength(HISTORY_LIMIT);
    expect(out[0]?.id).toBe('new');
  });
});

describe('MemoryStorage', () => {
  it('returns default settings, then saved ones', async () => {
    const s = new MemoryStorage();
    expect(await s.getSettings()).toEqual(DEFAULT_SETTINGS);
    await s.saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' });
    expect((await s.getSettings()).theme).toBe('dark');
  });

  it('lists playlists oldest first and deletes by id', async () => {
    const s = new MemoryStorage();
    await s.savePlaylist(pl('b', 2));
    await s.savePlaylist(pl('a', 1));
    expect((await s.getPlaylists()).map((p) => p.id)).toEqual(['a', 'b']);
    await s.deletePlaylist('a');
    expect((await s.getPlaylists()).map((p) => p.id)).toEqual(['b']);
  });

  it('isolates stored data from caller mutation', async () => {
    const s = new MemoryStorage();
    const p = pl('a', 1);
    await s.savePlaylist(p);
    p.tracks.push(t('x'));
    (await s.getPlaylists())[0]?.tracks.push(t('y'));
    expect((await s.getPlaylists())[0]?.tracks).toEqual([]);
  });

  it('records history newest first with a limit', async () => {
    const s = new MemoryStorage();
    await s.addHistory(t('a'));
    await s.addHistory(t('b'));
    await s.addHistory(t('a'));
    expect((await s.getHistory(10)).map((x) => x.id)).toEqual(['a', 'b']);
    expect(await s.getHistory(1)).toHaveLength(1);
  });
});
