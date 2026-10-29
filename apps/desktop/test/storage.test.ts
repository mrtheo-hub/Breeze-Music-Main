import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_SETTINGS, type LocalPlaylist, type Track } from '@breeze/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { JsonFileStorage } from '../src/main/storage';

const t = (id: string): Track => ({ id, title: id, artists: [], thumbnails: [] });
const pl = (id: string, createdAt: number): LocalPlaylist => ({
  id,
  name: id,
  tracks: [],
  createdAt,
  updatedAt: createdAt,
});

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'breeze-'));
});

describe('JsonFileStorage', () => {
  it('starts with defaults in an empty folder', async () => {
    const s = new JsonFileStorage(dir);
    expect(await s.getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(await s.getPlaylists()).toEqual([]);
    expect(await s.getHistory(10)).toEqual([]);
  });

  it('persists across instances', async () => {
    const a = new JsonFileStorage(dir);
    await a.savePlaylist(pl('p', 1));
    await a.saveSettings({ ...DEFAULT_SETTINGS, theme: 'light' });
    await a.addHistory(t('x'));
    const b = new JsonFileStorage(dir);
    expect((await b.getPlaylists()).map((p) => p.id)).toEqual(['p']);
    expect((await b.getSettings()).theme).toBe('light');
    expect((await b.getHistory(10)).map((x) => x.id)).toEqual(['x']);
  });

  it('keeps both of two concurrent writes', async () => {
    const s = new JsonFileStorage(dir);
    await Promise.all([s.savePlaylist(pl('a', 1)), s.savePlaylist(pl('b', 2))]);
    const raw = JSON.parse(await readFile(join(dir, 'library.json'), 'utf8'));
    expect(raw.playlists.map((p: LocalPlaylist) => p.id)).toEqual(['a', 'b']);
  });

  it('replaces a playlist with the same id and deletes by id', async () => {
    const s = new JsonFileStorage(dir);
    await s.savePlaylist(pl('a', 1));
    await s.savePlaylist({ ...pl('a', 1), name: 'renamed' });
    expect((await s.getPlaylists()).map((p) => p.name)).toEqual(['renamed']);
    await s.deletePlaylist('a');
    expect(await s.getPlaylists()).toEqual([]);
  });

  it('backs up a corrupt file and starts fresh', async () => {
    await writeFile(join(dir, 'library.json'), '{ not json');
    const s = new JsonFileStorage(dir);
    expect(await s.getSettings()).toEqual(DEFAULT_SETTINGS);
    expect((await readdir(dir)).some((f) => /^library\.corrupt-\d+\.json$/.test(f))).toBe(true);
  });

  it('fills settings added in newer versions with defaults', async () => {
    await writeFile(join(dir, 'library.json'), JSON.stringify({ settings: { theme: 'dark' } }));
    expect(await new JsonFileStorage(dir).getSettings()).toEqual({ ...DEFAULT_SETTINGS, theme: 'dark' });
  });

  it('does not let callers mutate stored data', async () => {
    const s = new JsonFileStorage(dir);
    await s.addHistory(t('x'));
    const [first] = await s.getHistory(1);
    if (first) first.title = 'changed';
    expect((await s.getHistory(1))[0]?.title).toBe('x');
  });
});
