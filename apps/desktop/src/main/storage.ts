import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  DEFAULT_SETTINGS,
  HISTORY_LIMIT,
  type LocalPlaylist,
  pushHistory,
  type Settings,
  type Storage,
  type Track,
} from '@breeze/core';

interface Library {
  playlists: LocalPlaylist[];
  settings: Settings;
  history: Track[];
}

function normalize(raw: unknown): Library {
  const r = (raw ?? {}) as Partial<Library>;
  return {
    playlists: Array.isArray(r.playlists) ? r.playlists : [],
    settings: { ...DEFAULT_SETTINGS, ...(r.settings ?? {}) },
    history: Array.isArray(r.history) ? r.history.slice(0, HISTORY_LIMIT) : [],
  };
}

/** Playlists, settings and history in one JSON file, written atomically (temp file + rename). */
export class JsonFileStorage implements Storage {
  private library: Promise<Library> | null = null;
  private writing: Promise<void> = Promise.resolve();
  private readonly file: string;

  constructor(private readonly dir: string) {
    this.file = join(dir, 'library.json');
  }

  async getPlaylists(): Promise<LocalPlaylist[]> {
    const lib = await this.load();
    return structuredClone(lib.playlists).sort((a, b) => a.createdAt - b.createdAt);
  }

  savePlaylist(p: LocalPlaylist): Promise<void> {
    return this.update((lib) => {
      const copy = structuredClone(p);
      const at = lib.playlists.findIndex((x) => x.id === p.id);
      if (at === -1) lib.playlists.push(copy);
      else lib.playlists[at] = copy;
    });
  }

  deletePlaylist(id: string): Promise<void> {
    return this.update((lib) => {
      lib.playlists = lib.playlists.filter((p) => p.id !== id);
    });
  }

  async getSettings(): Promise<Settings> {
    return { ...(await this.load()).settings };
  }

  saveSettings(s: Settings): Promise<void> {
    return this.update((lib) => {
      lib.settings = { ...s };
    });
  }

  addHistory(t: Track): Promise<void> {
    return this.update((lib) => {
      lib.history = pushHistory(lib.history, structuredClone(t));
    });
  }

  async getHistory(limit: number): Promise<Track[]> {
    return structuredClone((await this.load()).history.slice(0, limit));
  }

  private load(): Promise<Library> {
    this.library ??= this.read();
    return this.library;
  }

  private async read(): Promise<Library> {
    let raw: string;
    try {
      raw = await readFile(this.file, 'utf8');
    } catch {
      return normalize({}); // first run: no file yet
    }
    try {
      return normalize(JSON.parse(raw));
    } catch {
      // Keep the unreadable file for recovery instead of overwriting it on the next save.
      await rename(this.file, join(this.dir, `library.corrupt-${Date.now()}.json`)).catch(() => undefined);
      return normalize({});
    }
  }

  private async update(change: (lib: Library) => void): Promise<void> {
    const lib = await this.load();
    change(lib);
    const json = JSON.stringify(lib);
    // Serialise writes; a failed write must not block the ones after it.
    this.writing = this.writing
      .catch(() => undefined)
      .then(async () => {
        await mkdir(this.dir, { recursive: true });
        const tmp = `${this.file}.tmp`;
        await writeFile(tmp, json, 'utf8');
        await rename(tmp, this.file);
      });
    return this.writing;
  }
}
