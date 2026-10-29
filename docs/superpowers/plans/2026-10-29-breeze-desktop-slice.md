# Breeze Desktop Slice Implementation Plan (Plan 2 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Windows Electron app where you open Breeze, see your YouTube Music home feed, search for a song, click it, and hear it, with a working player bar and Windows media keys. Built on a shared `@breeze/ui` package that the website will reuse.

**Architecture:** `@breeze/ui` holds the React screens and a framework-free `PlayerController` that drives any `AudioEngine`. The desktop app is electron-vite with three parts:
- The **main process** owns `youtubei.js` (`InnerTubeSource` plus a new `StreamResolver`) and a JSON-file `Storage`, all behind one typed IPC contract.
- The **preload** exposes `window.breeze`.
- The **renderer** mounts `@breeze/ui` with IPC adapters and an `<audio>`-based engine.

Errors cross IPC as `{ ok, error: { kind, message } }`, so the `SourceError` kind survives.

**Tech Stack:** Electron 45, electron-vite 6, Vite 8, React 19, lucide-react, youtubei.js 18.3 (`node:vm` evaluator), Vitest 5, Testing Library + jsdom.

**Spec:** `docs/superpowers/specs/2026-10-29-breeze-music-design.md`

**Plan series (renumbered: the desktop work is split in two):**
1. Done: monorepo + `packages/core`.
2. This plan: desktop vertical slice (home, search, play, player bar, media keys).
3. Desktop complete: album, artist and playlist pages, Library (local playlists, liked songs, history), queue panel, synced lyrics panel, settings (theme, quality, autoplay, volume persistence), tray icon.
4. Website: `apps/web` (landing page, `/app` web player, Vercel functions, IFrame engine, IndexedDB storage).
5. Release: electron-builder NSIS, GitHub Releases, electron-updater, app icon, Vercel project setup.

## Global Constraints

- Node 22+; pnpm workspace; TypeScript strict; React 19; Electron + Vite + React for desktop.
- All YouTube access goes through `packages/core`. `youtubei.js` is imported only from `packages/core/src/innertube.ts` and `packages/core/src/stream.ts`, and only in the Electron main process.
- Errors reach the UI as `SourceError { kind: 'network' | 'blocked' | 'not_found' | 'parse' }`, including across IPC.
- Playback failure on a track: show a toast and skip to the next track. Stop after 3 consecutive failures.
- Desktop stream URL expiry: re-resolve once, then treat it as a failure.
- Desktop storage: JSON file in `app.getPath('userData')`, written atomically (temp file, then rename).
- Media keys and the Windows media overlay use `navigator.mediaSession`. Single-instance lock.
- Electron security: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, a CSP meta tag, external links opened in the system browser only.
- YouTube's player JS (needed to decipher stream URLs) runs in a fresh `node:vm` context with a 2 s timeout, never via `new Function` in the main process.
- UI: no emoji. Colors come from CSS custom properties. Every data screen has loading, empty and error states. Every control has a visible focus ring and an accessible name.
- No live network in CI tests. CI on every push: typecheck, lint, unit tests.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Spec deviations (decided while planning):**
- Desktop file layout follows electron-vite convention (`src/main`, `src/preload`, `src/renderer`) instead of the spec's `electron/main.ts`.
- `AudioEngine.on` is typed per event (`EngineEvents`). It is compatible with the spec's untyped signature.
- The audio client is the `YTMUSIC` client with an `IOS` fallback. Spiked on 2026-10-29: both return `audio/mp4` and a `206` on a ranged GET. `WEB`, `ANDROID` and `TV` failed.

## Review Focus

1. **Rapid clicks on different tracks:** only the last-clicked track plays; a slow earlier load must not start playing afterwards. Pinned in Task 3 (controller) and Task 8 (engine).
2. **Stream URL expires or is 403'd mid-session** (paused overnight, then Play): Breeze re-resolves once at the same position, then reports one error. Pinned in Task 8.
3. **Typing fast in search, or clearing it:** an older response never overwrites newer results; a cleared box shows the idle prompt. Pinned in Task 4 (`useAsync`) and Task 5.
4. **Tracks with `artists: []`, no thumbnails, no duration** (common in live search data): rows and the player bar show "Unknown artist" and a placeholder tile, never `undefined` or a broken image. Pinned in Tasks 4 and 5.
5. **A corrupt or missing `library.json`** (crash mid-write, hand edit): Breeze starts with defaults and keeps a backup of the bad file instead of silently overwriting it. Pinned in Task 6.

---

## File map

```
packages\core\
  scripts\capture-fixtures.ts         Task 1  live capture of real youtubei.js results
  test\fixtures\*.json                Task 1  captured data (committed)
  test\fixtures.test.ts               Task 1
  src\mappers.ts                      Task 1  toText reads Text.text
  src\errors.ts                       Task 2  + guard()
  src\stream.ts                       Task 2  StreamResolver, pickFormat, expiryOf, installVmEvaluator
  src\innertube.ts                    Task 2  uses shared guard
packages\ui\
  package.json, tsconfig.json, vitest.config.ts               Task 3
  src\player\{engine,emitter,controller,index}.ts             Task 3
  src\player\PlayerContext.tsx, useMediaSession.ts            Tasks 4, 5
  src\format.ts, src\hooks\{useAsync,useDebounced}.ts         Task 4
  src\services.tsx                                            Task 4
  src\components\{Artwork,TrackRow,States}.tsx                Task 4
  src\components\{PlayerBar,ErrorToast,AppShell}.tsx          Task 5
  src\screens\{HomeScreen,SearchScreen}.tsx                   Task 5
  src\App.tsx, src\index.ts, src\styles.css                   Task 5
  test\*.test.ts(x), test\helpers.tsx
apps\desktop\
  package.json, tsconfig.json, electron.vite.config.ts        Tasks 6, 9
  src\main\storage.ts                                         Task 6  JsonFileStorage
  src\shared\{ipc,result}.ts                                  Task 7  IPC contract
  src\main\{ipc,services}.ts                                  Task 7
  src\renderer\src\ipc-adapters.ts                            Task 7
  src\renderer\src\html-audio-engine.ts                       Task 8
  src\main\index.ts, src\preload\index.ts                     Task 9
  src\renderer\index.html, src\renderer\src\{main.tsx,env.d.ts}  Task 9
  test\*.test.ts
package.json (root)                   Tasks 6, 9
.github\workflows\ci.yml              Task 9
```

---

### Task 1: Mapper tests against real captured data

**Files:**
- Create: `packages/core/scripts/capture-fixtures.ts`, `packages/core/test/fixtures/*.json` (generated), `packages/core/test/fixtures.test.ts`
- Modify: `packages/core/src/mappers.ts` (`toText`), `packages/core/test/mappers.test.ts`, `packages/core/package.json` (script)

**Interfaces:**
- Consumes: `InnerTubeSource`, `MusicClient` (Plan 1).
- Produces: `toText(v)` now returns `v.text` for youtubei.js `Text`-like objects (`{ text, runs }`), and `''` when `text` is missing (fixes the "N/A" title minor).

Why: the Plan 1 review found that hand-made fakes missed real shapes. Fixtures are produced by `JSON.stringify`, which drops class methods, so a `Text` arrives as `{ text, runs }`. That is exactly the case `toText` must handle.

- [ ] **Step 1: Add the capture script**

Add to `packages/core/package.json` `scripts`: `"capture": "tsx scripts/capture-fixtures.ts"`

Create `packages/core/scripts/capture-fixtures.ts`:

```ts
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
```

- [ ] **Step 2: Capture**

Run: `pnpm --filter @breeze/core capture`
Expected: seven `saved …` lines. `packages/core/test/fixtures/` holds `search, home, album, artist, upnext, info, meta` `.json`. If it throws `search … lacked a song, album or artist`, change `QUERY` to another well-known artist and song, then re-run.

- [ ] **Step 3: Write the failing fixture test**

Create `packages/core/test/fixtures.test.ts`:

```ts
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
```

Add to `packages/core/test/mappers.test.ts`, inside a new `describe('toText', …)` block (also add `toText` to that file's import from `../src/mappers`):

```ts
describe('toText', () => {
  it('reads youtubei.js Text objects (as serialised: { text, runs })', () => {
    expect(toText({ text: 'Hello', runs: [] })).toBe('Hello');
  });

  it('treats a Text with no text as empty, not "N/A"', () => {
    expect(toText({ text: undefined, toString: () => 'N/A' })).toBe('');
  });

  it('still handles plain strings and toString-only objects', () => {
    expect(toText('  hi ')).toBe('hi');
    expect(toText(text('x'))).toBe('x');
    expect(toText(undefined)).toBe('');
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `pnpm --filter @breeze/core test fixtures mappers`
Expected: FAIL. At least the `toText` cases fail, and the fixture tests whose labels are `Text` objects fail with `[object Object]` (typically `home`, `album` and `artist`).

- [ ] **Step 5: Fix `toText`**

Replace `toText` in `packages/core/src/mappers.ts`:

```ts
/** youtubei.js `Text` nodes carry `.text`; their `toString()` returns "N/A" when empty. */
export const toText = (v: unknown): string => {
  if (v == null) return '';
  if (typeof v === 'object' && 'text' in v) return String((v as { text?: unknown }).text ?? '').trim();
  return String(v).trim();
};
```

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm --filter @breeze/core test` then `pnpm typecheck`
Expected: all tests PASS; typecheck exits 0.

If a fixture assertion still fails, open the named fixture file and search for the field the mapper reads (for example `"strapline_text_one"` or `"artists"`). Fix the mapper or the `InnerTubeSource` method to read the real shape. Then add a `mappers.test.ts` or `innertube.test.ts` case that copies that shape. Re-run until green. Never edit fixture JSON by hand.

- [ ] **Step 7: Commit**

```bash
git add packages/core
git commit -m "test(core): pin mappers to captured YouTube Music data; read Text.text" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: StreamResolver (playable audio URLs)

**Files:**
- Create: `packages/core/src/stream.ts`, `packages/core/test/stream.test.ts`
- Modify: `packages/core/src/errors.ts` (add `guard`), `packages/core/src/innertube.ts` (use it), `packages/core/test/errors.test.ts`, `packages/core/package.json` (export)

**Interfaces:**
- Consumes: `SourceError`, `toSourceError`, `AudioQuality`.
- Produces:
  - `guard<T>(fn: () => Promise<T>): Promise<T>` in `errors.ts`, exported from `@breeze/core`
  - Import path `@breeze/core/stream` (Node only):
    - `interface StreamInfo { url: string; mimeType: string; bitrate: number; expiresAt: number }` (`expiresAt` is ms since epoch)
    - `interface RawFormat { has_audio?: boolean; has_video?: boolean; bitrate?: number; mime_type?: string; decipher(player: unknown): Promise<string> | string }`
    - `interface StreamClient { player: unknown; musicInfo(id: string): Promise<any>; iosInfo(id: string): Promise<any> }`
    - `pickFormat(formats: RawFormat[], quality: AudioQuality): RawFormat | null`
    - `expiryOf(url: string, now?: number): number`
    - `installVmEvaluator(): void`
    - `class StreamResolver { constructor(client: StreamClient); static create(): Promise<StreamResolver>; resolve(id: string, quality?: AudioQuality): Promise<StreamInfo> }`

- [ ] **Step 1: Write the failing tests**

Add to `packages/core/test/errors.test.ts` (and add `guard` to its import):

```ts
describe('guard', () => {
  it('returns the value', async () => {
    expect(await guard(async () => 7)).toBe(7);
  });

  it('turns any throw into a SourceError', async () => {
    const err = await guard(async () => {
      throw new Error('fetch failed');
    }).catch((e) => e);
    expect(err).toBeInstanceOf(SourceError);
    expect(err.kind).toBe('network');
  });
});
```

Create `packages/core/test/stream.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { Platform } from 'youtubei.js';
import { SourceError } from '../src/errors';
import {
  expiryOf,
  installVmEvaluator,
  pickFormat,
  type RawFormat,
  type StreamClient,
  StreamResolver,
} from '../src/stream';

const fmt = (bitrate: number, over: Partial<RawFormat> = {}): RawFormat => ({
  has_audio: true,
  has_video: false,
  bitrate,
  mime_type: 'audio/mp4; codecs="mp4a.40.2"',
  decipher: async () => `https://rr1.googlevideo.com/videoplayback?expire=2000000000&b=${bitrate}`,
  ...over,
});

const info = (formats: RawFormat[]) => ({ streaming_data: { adaptive_formats: formats } });

describe('pickFormat', () => {
  const formats = [fmt(160_000), fmt(50_000), fmt(130_000), fmt(999_000, { has_video: true })];

  it('ignores video formats and picks by quality', () => {
    expect(pickFormat(formats, 'high')?.bitrate).toBe(160_000);
    expect(pickFormat(formats, 'low')?.bitrate).toBe(50_000);
    expect(pickFormat(formats, 'medium')?.bitrate).toBe(130_000);
  });

  it('returns null when there is no audio-only format', () => {
    expect(pickFormat([fmt(1, { has_video: true })], 'high')).toBeNull();
    expect(pickFormat([], 'high')).toBeNull();
  });
});

describe('expiryOf', () => {
  it('reads the expire query param (seconds) as ms', () => {
    expect(expiryOf('https://x/videoplayback?expire=2000000000')).toBe(2_000_000_000_000);
  });

  it('falls back to now + 6h', () => {
    expect(expiryOf('https://x/videoplayback', 1000)).toBe(1000 + 6 * 3600 * 1000);
  });
});

describe('installVmEvaluator', () => {
  it('runs code with env bindings and without Node globals', async () => {
    installVmEvaluator();
    const run = (output: string, env: Record<string, unknown> = {}) =>
      Platform.shim.eval({ output } as never, env as never);
    expect(await run('return typeof process')).toBe('undefined');
    expect(await run('return typeof require')).toBe('undefined');
    expect(await run('return n + 1', { n: 41 })).toBe(42);
  });
});

describe('StreamResolver.resolve', () => {
  const client = (over: Partial<StreamClient> = {}): StreamClient => ({
    player: { id: 'player' },
    musicInfo: vi.fn(async () => info([fmt(130_000)])),
    iosInfo: vi.fn(async () => info([fmt(64_000)])),
    ...over,
  });

  it('uses the music client first and deciphers with the player', async () => {
    const decipher = vi.fn(async () => 'https://rr1.googlevideo.com/videoplayback?expire=2000000000');
    const c = client({ musicInfo: vi.fn(async () => info([fmt(130_000, { decipher })])) });
    const s = await new StreamResolver(c).resolve('abc', 'high');
    expect(s).toEqual({
      url: 'https://rr1.googlevideo.com/videoplayback?expire=2000000000',
      mimeType: 'audio/mp4; codecs="mp4a.40.2"',
      bitrate: 130_000,
      expiresAt: 2_000_000_000_000,
    });
    expect(decipher).toHaveBeenCalledWith({ id: 'player' });
    expect(c.iosInfo).not.toHaveBeenCalled();
  });

  it('falls back to the IOS client when the music client has no audio', async () => {
    const c = client({ musicInfo: vi.fn(async () => info([])) });
    expect((await new StreamResolver(c).resolve('abc')).bitrate).toBe(64_000);
  });

  it('falls back to the IOS client when the music client throws', async () => {
    const c = client({
      musicInfo: vi.fn(async () => {
        throw new Error('No valid URL to decipher');
      }),
    });
    expect((await new StreamResolver(c).resolve('abc')).bitrate).toBe(64_000);
  });

  it('reports the last failure as a SourceError when both clients fail', async () => {
    const c = client({
      musicInfo: vi.fn(async () => info([])),
      iosInfo: vi.fn(async () => {
        throw new Error('Request to https://x failed with status code 403');
      }),
    });
    const err = await new StreamResolver(c).resolve('abc').catch((e) => e);
    expect(err).toBeInstanceOf(SourceError);
    expect(err.kind).toBe('blocked');
  });

  it('reports not_found when no client has any audio', async () => {
    const c = client({ musicInfo: vi.fn(async () => info([])), iosInfo: vi.fn(async () => ({})) });
    const err = await new StreamResolver(c).resolve('abc').catch((e) => e);
    expect(err.kind).toBe('not_found');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @breeze/core test stream errors`
Expected: FAIL. `../src/stream` cannot be resolved, and `guard` is not exported.

- [ ] **Step 3: Move `guard` into errors.ts**

Append to `packages/core/src/errors.ts`:

```ts
/** Run `fn`; rethrow anything it throws as a SourceError. */
export async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw toSourceError(e);
  }
}
```

In `packages/core/src/innertube.ts`:
- Delete the local `async function guard…` at the bottom of the file.
- Change the errors import to `import { guard, SourceError } from './errors';`, dropping `toSourceError` if it's no longer used there.

- [ ] **Step 4: Implement the resolver**

Add to `packages/core/package.json` `exports`: `"./stream": "./src/stream.ts"`

Create `packages/core/src/stream.ts`:

```ts
import vm from 'node:vm';
import { Innertube, Platform } from 'youtubei.js';
import { guard, SourceError } from './errors';
import type { AudioQuality } from './types';

export interface StreamInfo {
  url: string;
  mimeType: string;
  bitrate: number;
  /** ms since epoch after which the URL stops working. */
  expiresAt: number;
}

export interface RawFormat {
  has_audio?: boolean;
  has_video?: boolean;
  bitrate?: number;
  mime_type?: string;
  decipher(player: unknown): Promise<string> | string;
}

/** The youtubei.js calls the resolver needs. Each info call may throw. */
export interface StreamClient {
  player: unknown;
  musicInfo(id: string): Promise<any>;
  iosInfo(id: string): Promise<any>;
}

const SIX_HOURS = 6 * 3600 * 1000;

export function pickFormat(formats: RawFormat[], quality: AudioQuality): RawFormat | null {
  const audio = formats.filter((f) => f.has_audio && !f.has_video).sort((a, b) => (a.bitrate ?? 0) - (b.bitrate ?? 0));
  if (audio.length === 0) return null;
  const at = quality === 'low' ? 0 : quality === 'medium' ? Math.floor((audio.length - 1) / 2) : audio.length - 1;
  return audio[at] ?? null;
}

export function expiryOf(url: string, now = Date.now()): number {
  const expire = Number(new URL(url).searchParams.get('expire'));
  return Number.isFinite(expire) && expire > 0 ? expire * 1000 : now + SIX_HOURS;
}

let evaluatorInstalled = false;

/**
 * youtubei.js needs a JS evaluator to decipher stream URLs. YouTube's player code runs
 * in a fresh vm context (JS builtins + env only: no process, require or Electron) with a timeout.
 */
export function installVmEvaluator(): void {
  if (evaluatorInstalled) return;
  Platform.shim.eval = (data: { output: string }, env: Record<string, unknown>) =>
    vm.runInNewContext(`(function(){${data.output}})()`, { ...env }, { timeout: 2000 });
  evaluatorInstalled = true;
}

export class StreamResolver {
  constructor(private readonly client: StreamClient) {}

  static create(): Promise<StreamResolver> {
    return guard(async () => {
      installVmEvaluator();
      const yt = await Innertube.create({ retrieve_player: true });
      return new StreamResolver({
        player: yt.session.player,
        musicInfo: (id) => yt.music.getInfo(id),
        iosInfo: (id) => yt.getBasicInfo(id, { client: 'IOS' }),
      });
    });
  }

  /** Try the YouTube Music client, then IOS. Spiked 2026-10-29: both give audio/mp4 that plays. */
  resolve(id: string, quality: AudioQuality = 'high'): Promise<StreamInfo> {
    return guard(async () => {
      let lastError: unknown = new SourceError('not_found', `No playable audio for ${id}`);
      for (const load of [this.client.musicInfo, this.client.iosInfo]) {
        try {
          const info = await load.call(this.client, id);
          const format = pickFormat(info?.streaming_data?.adaptive_formats ?? [], quality);
          if (!format) continue;
          const url = await format.decipher(this.client.player);
          return {
            url,
            mimeType: format.mime_type ?? 'audio/mp4',
            bitrate: format.bitrate ?? 0,
            expiresAt: expiryOf(url),
          };
        } catch (e) {
          lastError = e;
        }
      }
      throw lastError;
    });
  }
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @breeze/core test` then `pnpm typecheck`
Expected: all PASS; typecheck exits 0.

If typecheck rejects the `Platform.shim.eval` assignment, change the parameter types to `Types.BuildScriptResult` and `Record<string, Types.VMPrimative>` (`import { …, type Types } from 'youtubei.js'`). Keep the body.

- [ ] **Step 6: Live check**

Add to `packages/core/scripts/smoke.ts`, after the `up next` log line (and add `import { StreamResolver } from '../src/stream';` at the top):

```ts
const streams = await StreamResolver.create();
const stream = await streams.resolve(song.id, 'high');
const probe = await fetch(stream.url, { headers: { Range: 'bytes=0-1023' } });
console.log('stream:', stream.mimeType, stream.bitrate, '->', probe.status);
```

Run: `pnpm --filter @breeze/core smoke`
Expected: a `stream: audio/… <bitrate> -> 206` line (200 is also acceptable), and exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/core
git commit -m "feat(core): resolve playable audio URLs with a sandboxed vm evaluator" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `@breeze/ui` package + PlayerController

**Files:**
- Create: `packages/ui/package.json`, `packages/ui/tsconfig.json`, `packages/ui/vitest.config.ts`
- Create: `packages/ui/src/player/engine.ts`, `emitter.ts`, `controller.ts`, `index.ts`
- Create: `packages/ui/test/helpers.tsx`, `packages/ui/test/controller.test.ts`

**Interfaces:**
- Consumes: from `@breeze/core`: `Track`, `MusicSource`, `Storage`, `MemoryStorage`, `QueueState`, `RepeatMode`, and the queue functions `current`, `emptyQueue`, `enqueue`, `next`, `prev`, `setQueue`, `setRepeat`, `toggleShuffle`, plus `toSourceError`.
- Produces (import path `@breeze/ui/player`, also re-exported from `@breeze/ui` in Task 5):
  - `type PlaybackState = 'loading' | 'playing' | 'paused'`
  - `interface EngineEvents { time: { position: number; duration: number }; ended: undefined; error: unknown; state: PlaybackState }`
  - `interface AudioEngine { load(track: Track): Promise<void>; play(): void; pause(): void; seek(seconds: number): void; setVolume(v: number): void; on<K extends keyof EngineEvents>(event: K, cb: (payload: EngineEvents[K]) => void): () => void }`
  - `class Emitter<E> { on<K extends keyof E>(event: K, cb: (payload: E[K]) => void): () => void; emit<K extends keyof E>(event: K, payload: E[K]): void }`
  - `type PlayerStatus = 'idle' | PlaybackState`
  - `interface PlayerState { queue: QueueState; status: PlayerStatus; position: number; duration: number; volume: number; error: string | null }`
  - `interface PlayerDeps { engine: AudioEngine; source: MusicSource; storage: Storage; autoplay?: () => boolean }`
  - `class PlayerController` with:
    - `constructor(deps: PlayerDeps, volume?: number)`
    - state access: `getState()`, `subscribe(listener): () => void`
    - playback: `playTracks(tracks, startIndex?): Promise<void>`, `resume()`, `pause()`, `playPause()`, `next(): Promise<void>`, `prev(): Promise<void>`, `seek(seconds)`
    - volume: `setVolume(v)`, `toggleMute()`
    - modes: `toggleShuffle()`, `cycleRepeat()`
    - errors: `dismissError()`
  - Test helpers in `packages/ui/test/helpers.tsx` (`FakeEngine`, `fakeSource`, `t`, `flush`, `setup`, plus `renderWithApp` added in Task 4).

- [ ] **Step 1: Scaffold the package**

Create `packages/ui/package.json`:

```json
{
  "name": "@breeze/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./player": "./src/player/index.ts",
    "./styles.css": "./src/styles.css"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p ."
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

Create `packages/ui/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "jsx": "react-jsx" },
  "include": ["src", "test", "vitest.config.ts"]
}
```

Create `packages/ui/vitest.config.ts`:

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // globals: true lets Testing Library register its automatic cleanup.
  test: { environment: 'jsdom', globals: true },
});
```

Run:

```bash
pnpm --filter @breeze/ui add @breeze/core@workspace:* lucide-react
pnpm --filter @breeze/ui add -D react react-dom @types/react @types/react-dom typescript vitest vite @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom
```

Expected: both installs succeed.

- [ ] **Step 2: Engine contract and emitter**

Create `packages/ui/src/player/engine.ts`:

```ts
import type { Track } from '@breeze/core';

export type PlaybackState = 'loading' | 'playing' | 'paused';

export interface EngineEvents {
  time: { position: number; duration: number };
  ended: undefined;
  error: unknown;
  state: PlaybackState;
}

/** Plays one track at a time. Desktop: <audio> + resolved stream. Web: YouTube IFrame player. */
export interface AudioEngine {
  load(track: Track): Promise<void>;
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  setVolume(v: number): void;
  on<K extends keyof EngineEvents>(event: K, cb: (payload: EngineEvents[K]) => void): () => void;
}
```

Create `packages/ui/src/player/emitter.ts`:

```ts
export class Emitter<E> {
  private readonly handlers = new Map<keyof E, Set<(payload: never) => void>>();

  on<K extends keyof E>(event: K, cb: (payload: E[K]) => void): () => void {
    const set = this.handlers.get(event) ?? new Set();
    this.handlers.set(event, set);
    set.add(cb as (payload: never) => void);
    return () => {
      set.delete(cb as (payload: never) => void);
    };
  }

  emit<K extends keyof E>(event: K, payload: E[K]): void {
    for (const cb of this.handlers.get(event) ?? []) (cb as (p: E[K]) => void)(payload);
  }
}
```

- [ ] **Step 3: Test helpers**

Create `packages/ui/test/helpers.tsx`:

```tsx
import { MemoryStorage, type MusicSource, type Track } from '@breeze/core';
import { PlayerController } from '../src/player/controller';
import { Emitter } from '../src/player/emitter';
import type { AudioEngine, EngineEvents } from '../src/player/engine';

export const t = (id: string, extra: Partial<Track> = {}): Track => ({
  id,
  title: `Song ${id}`,
  artists: [{ name: `Artist ${id}` }],
  thumbnails: [],
  ...extra,
});

export const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

export class FakeEngine implements AudioEngine {
  readonly events = new Emitter<EngineEvents>();
  readonly loaded: string[] = [];
  readonly plays: string[] = [];
  readonly seeks: number[] = [];
  readonly failIds = new Set<string>();
  readonly gates = new Map<string, Promise<void>>();
  volume = 1;

  async load(track: Track): Promise<void> {
    this.loaded.push(track.id);
    await this.gates.get(track.id);
    if (this.failIds.has(track.id)) throw new Error('Request to https://x failed with status code 403');
  }

  play(): void {
    this.plays.push(this.loaded.at(-1) ?? '');
    this.events.emit('state', 'playing');
  }

  pause(): void {
    this.events.emit('state', 'paused');
  }

  seek(seconds: number): void {
    this.seeks.push(seconds);
  }

  setVolume(v: number): void {
    this.volume = v;
  }

  on<K extends keyof EngineEvents>(event: K, cb: (payload: EngineEvents[K]) => void): () => void {
    return this.events.on(event, cb);
  }
}

export function fakeSource(over: Partial<MusicSource> = {}): MusicSource {
  const missing = () => Promise.reject(new Error('not stubbed'));
  return {
    home: missing,
    search: missing,
    track: missing,
    album: missing,
    artist: missing,
    playlist: missing,
    upNext: async () => [],
    ...over,
  };
}

export function setup(over: { source?: Partial<MusicSource>; autoplay?: boolean } = {}) {
  const engine = new FakeEngine();
  const storage = new MemoryStorage();
  const source = fakeSource(over.source);
  const player = new PlayerController({ engine, source, storage, autoplay: () => over.autoplay ?? true });
  return { engine, storage, source, player };
}
```

- [ ] **Step 4: Write the failing controller test**

Create `packages/ui/test/controller.test.ts`:

```ts
import { current } from '@breeze/core';
import { describe, expect, it, vi } from 'vitest';
import { flush, setup, t } from './helpers';

describe('PlayerController', () => {
  it('plays the chosen track and records history', async () => {
    const { engine, storage, player } = setup();
    await player.playTracks([t('a'), t('b')], 1);
    expect(engine.loaded).toEqual(['b']);
    expect(engine.plays).toEqual(['b']);
    expect(player.getState().status).toBe('playing');
    await flush();
    expect((await storage.getHistory(5)).map((x) => x.id)).toEqual(['b']);
  });

  it('advances when a track ends', async () => {
    const { engine, player } = setup();
    await player.playTracks([t('a'), t('b')]);
    engine.events.emit('ended', undefined);
    await flush();
    expect(engine.loaded).toEqual(['a', 'b']);
  });

  it('repeat one restarts the same track without reloading', async () => {
    const { engine, player } = setup();
    await player.playTracks([t('a'), t('b')]);
    player.cycleRepeat(); // all
    player.cycleRepeat(); // one
    engine.events.emit('ended', undefined);
    await flush();
    expect(engine.loaded).toEqual(['a']);
    expect(engine.seeks).toEqual([0]);
  });

  it('continues with up-next tracks when the queue ends and autoplay is on', async () => {
    const upNext = vi.fn(async () => [t('x'), t('y')]);
    const { engine, player } = setup({ source: { upNext } });
    await player.playTracks([t('a')]);
    engine.events.emit('ended', undefined);
    await flush();
    expect(upNext).toHaveBeenCalledWith('a');
    expect(engine.loaded).toEqual(['a', 'x']);
  });

  it('stops at the end when autoplay is off', async () => {
    const upNext = vi.fn(async () => [t('x')]);
    const { engine, player } = setup({ source: { upNext }, autoplay: false });
    await player.playTracks([t('a')]);
    engine.events.emit('ended', undefined);
    await flush();
    expect(upNext).not.toHaveBeenCalled();
    expect(player.getState().status).toBe('paused');
  });

  it('shows an error and stops when up-next fails', async () => {
    const { engine, player } = setup({
      source: {
        upNext: async () => {
          throw new Error('fetch failed');
        },
      },
    });
    await player.playTracks([t('a')]);
    engine.events.emit('ended', undefined);
    await flush();
    expect(player.getState().error).toMatch(/connection/i);
    expect(player.getState().status).toBe('paused');
  });

  it('skips a track that fails to load and says why', async () => {
    const { engine, player } = setup();
    engine.failIds.add('a');
    await player.playTracks([t('a'), t('b')]);
    expect(engine.loaded).toEqual(['a', 'b']);
    expect(engine.plays).toEqual(['b']);
    expect(player.getState().error).toMatch(/limiting/i);
  });

  it('stops after 3 consecutive failures', async () => {
    const { engine, player } = setup();
    for (const id of ['a', 'b', 'c', 'd']) engine.failIds.add(id);
    await player.playTracks([t('a'), t('b'), t('c'), t('d')]);
    expect(engine.loaded).toEqual(['a', 'b', 'c']);
    expect(player.getState().status).toBe('paused');
  });

  it('only the last of several rapid clicks plays', async () => {
    const { engine, player } = setup();
    let release = () => {};
    engine.gates.set(
      'slow',
      new Promise<void>((r) => {
        release = r;
      }),
    );
    const first = player.playTracks([t('slow')]);
    await player.playTracks([t('fast')]);
    release();
    await first;
    expect(engine.plays).toEqual(['fast']);
    expect(current(player.getState().queue)?.id).toBe('fast');
  });

  it('prev restarts the track after 3 s, otherwise goes back', async () => {
    const { engine, player } = setup();
    await player.playTracks([t('a'), t('b')], 1);
    engine.events.emit('time', { position: 10, duration: 200 });
    await player.prev();
    expect(engine.seeks).toEqual([0]);
    engine.events.emit('time', { position: 1, duration: 200 });
    await player.prev();
    expect(engine.loaded).toEqual(['b', 'a']);
  });

  it('clamps volume and toggles mute back to the last level', () => {
    const { engine, player } = setup();
    player.setVolume(1.7);
    expect(engine.volume).toBe(1);
    player.setVolume(0.3);
    player.toggleMute();
    expect(player.getState().volume).toBe(0);
    player.toggleMute();
    expect(player.getState().volume).toBe(0.3);
  });

  it('cycles repeat off -> all -> one -> off', () => {
    const { player } = setup();
    const seen = [1, 2, 3].map(() => {
      player.cycleRepeat();
      return player.getState().queue.repeat;
    });
    expect(seen).toEqual(['all', 'one', 'off']);
  });

  it('notifies subscribers and stops after unsubscribe', () => {
    const { player } = setup();
    const listener = vi.fn();
    const off = player.subscribe(listener);
    player.toggleShuffle();
    off();
    player.toggleShuffle();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 5: Run to verify it fails**

Run: `pnpm --filter @breeze/ui test`
Expected: FAIL, cannot resolve `../src/player/controller`.

- [ ] **Step 6: Implement the controller**

Create `packages/ui/src/player/controller.ts`:

```ts
import {
  current,
  emptyQueue,
  enqueue,
  type MusicSource,
  next as nextInQueue,
  prev as prevInQueue,
  type QueueState,
  type RepeatMode,
  type Storage,
  setQueue,
  setRepeat,
  toggleShuffle as shuffleQueue,
  type Track,
  toSourceError,
} from '@breeze/core';
import type { AudioEngine, PlaybackState } from './engine';

export type PlayerStatus = 'idle' | PlaybackState;

export interface PlayerState {
  queue: QueueState;
  status: PlayerStatus;
  position: number;
  duration: number;
  volume: number;
  /** User-facing message for the last failure, or null. */
  error: string | null;
}

export interface PlayerDeps {
  engine: AudioEngine;
  source: MusicSource;
  storage: Storage;
  /** Read each time the queue ends, so a settings change applies immediately. */
  autoplay?: () => boolean;
}

const MAX_FAILURES = 3;
const RESTART_AFTER_SEC = 3;
const REPEAT_ORDER: RepeatMode[] = ['off', 'all', 'one'];

export class PlayerController {
  private state: PlayerState;
  private readonly listeners = new Set<() => void>();
  private failures = 0;
  private loadToken = 0;
  private lastVolume: number;

  constructor(
    private readonly deps: PlayerDeps,
    volume = 0.8,
  ) {
    this.lastVolume = volume;
    this.state = { queue: emptyQueue(), status: 'idle', position: 0, duration: 0, volume, error: null };
    deps.engine.setVolume(volume);
    deps.engine.on('time', ({ position, duration }) =>
      this.patch({ position, duration: duration || this.state.duration }),
    );
    deps.engine.on('state', (status) => {
      if (status === 'playing') this.failures = 0;
      this.patch({ status });
    });
    deps.engine.on('ended', () => void this.advance(true));
    deps.engine.on('error', (e) => void this.fail(e));
  }

  readonly getState = (): PlayerState => this.state;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  playTracks(tracks: Track[], startIndex = 0): Promise<void> {
    this.failures = 0;
    this.patch({ queue: setQueue(this.state.queue, tracks, startIndex), error: null });
    return this.load();
  }

  resume(): void {
    if (current(this.state.queue)) this.deps.engine.play();
  }

  pause(): void {
    this.deps.engine.pause();
  }

  playPause(): void {
    if (this.state.status === 'playing') this.pause();
    else this.resume();
  }

  next(): Promise<void> {
    return this.advance(false);
  }

  prev(): Promise<void> {
    if (this.state.position > RESTART_AFTER_SEC) {
      this.seek(0);
      return Promise.resolve();
    }
    this.patch({ queue: prevInQueue(this.state.queue) });
    return this.load();
  }

  seek(seconds: number): void {
    this.deps.engine.seek(seconds);
    this.patch({ position: seconds });
  }

  setVolume(volume: number): void {
    const v = Math.min(1, Math.max(0, volume));
    if (v > 0) this.lastVolume = v;
    this.deps.engine.setVolume(v);
    this.patch({ volume: v });
  }

  toggleMute(): void {
    this.setVolume(this.state.volume > 0 ? 0 : this.lastVolume);
  }

  toggleShuffle(): void {
    this.patch({ queue: shuffleQueue(this.state.queue) });
  }

  cycleRepeat(): void {
    const at = REPEAT_ORDER.indexOf(this.state.queue.repeat);
    const mode = REPEAT_ORDER[(at + 1) % REPEAT_ORDER.length] as RepeatMode;
    this.patch({ queue: setRepeat(this.state.queue, mode) });
  }

  dismissError(): void {
    this.patch({ error: null });
  }

  private patch(change: Partial<PlayerState>): void {
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener();
  }

  private async advance(auto: boolean): Promise<void> {
    if (auto && this.state.queue.repeat === 'one') {
      this.seek(0);
      this.deps.engine.play();
      return;
    }
    const { state, ended } = nextInQueue(this.state.queue, auto);
    if (!ended) {
      this.patch({ queue: state });
      return this.load();
    }
    if (!auto) return;
    const seed = current(this.state.queue);
    if (seed && (this.deps.autoplay?.() ?? true)) {
      try {
        const more = await this.deps.source.upNext(seed.id);
        if (more.length > 0) {
          this.patch({ queue: nextInQueue(enqueue(this.state.queue, more)).state });
          return this.load();
        }
      } catch (e) {
        this.patch({ error: messageFor(e) });
      }
    }
    this.patch({ status: 'paused', position: 0 });
  }

  private async load(): Promise<void> {
    const track = current(this.state.queue);
    if (!track) {
      this.patch({ status: 'idle', position: 0, duration: 0 });
      return;
    }
    const token = ++this.loadToken;
    this.patch({ status: 'loading', position: 0, duration: track.durationSec ?? 0 });
    try {
      await this.deps.engine.load(track);
      if (token !== this.loadToken) return; // a newer click won
      this.deps.engine.play();
      this.deps.storage.addHistory(track).catch(() => undefined);
    } catch (e) {
      if (token === this.loadToken) await this.fail(e);
    }
  }

  private async fail(e: unknown): Promise<void> {
    this.failures += 1;
    this.patch({ error: messageFor(e) });
    if (this.failures >= MAX_FAILURES) {
      this.deps.engine.pause();
      this.patch({ status: 'paused' });
      return;
    }
    const { state, ended } = nextInQueue(this.state.queue);
    if (ended) {
      this.patch({ status: 'paused' });
      return;
    }
    this.patch({ queue: state });
    await this.load();
  }
}

function messageFor(e: unknown): string {
  switch (toSourceError(e).kind) {
    case 'network':
      return "Can't reach YouTube Music. Check your connection.";
    case 'blocked':
      return 'YouTube is limiting requests. Try again in a minute.';
    case 'not_found':
      return "That track isn't available.";
    default:
      return "Couldn't play that track.";
  }
}
```

Create `packages/ui/src/player/index.ts`:

```ts
export * from './controller';
export * from './emitter';
export * from './engine';
```

- [ ] **Step 7: Run tests and typecheck**

Run: `pnpm --filter @breeze/ui test` then `pnpm typecheck`
Expected: all controller tests PASS; typecheck exits 0.

- [ ] **Step 8: Commit**

```bash
git add packages/ui pnpm-lock.yaml
git commit -m "feat(ui): add PlayerController over a pluggable AudioEngine" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: React bindings, data hooks, and the track row

**Files:**
- Create: `packages/ui/src/player/PlayerContext.tsx`, `packages/ui/src/services.tsx`, `packages/ui/src/format.ts`
- Create: `packages/ui/src/hooks/useAsync.ts`, `packages/ui/src/hooks/useDebounced.ts`
- Create: `packages/ui/src/components/Artwork.tsx`, `TrackRow.tsx`, `States.tsx`
- Modify: `packages/ui/test/helpers.tsx` (add `renderWithApp`)
- Test: `packages/ui/test/format.test.ts`, `useAsync.test.tsx`, `components.test.tsx`

**Interfaces:**
- Consumes: `PlayerController`, `PlayerState` (Task 3); `MusicSource`, `Storage`, `Track`, `Thumbnail`, `ArtistRef`, `SourceError`, `SourceErrorKind`, `toSourceError`.
- Produces:
  - `PlayerProvider({ controller, children })`, `usePlayer(): { state: PlayerState; player: PlayerController }`
  - `interface Services { source: MusicSource; storage: Storage }`, `ServicesProvider({ services, children })`, `useServices(): Services`
  - `formatTime(sec: number): string`, `artistNames(artists: ArtistRef[]): string`, `pickThumb(thumbs: Thumbnail[], size: number): string | undefined`, `uniqueById<T extends { id: string }>(items: T[]): T[]`
  - `type AsyncState<T> = { status: 'idle' } | { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; error: SourceError }`
  - `useAsync<T>(key: string | null, load: () => Promise<T>): AsyncState<T> & { retry: () => void }`. A `null` key means idle; a key change reloads; a stale result is dropped.
  - `useDebounced<T>(value: T, ms: number): T`
  - `Artwork({ thumbnails, size, className })`, `TrackRow({ track, active?, onPlay })`, `ErrorState({ error, onRetry })`, `EmptyState({ title, body })`, `RowsSkeleton()`
  - `renderWithApp(ui, over?)` test helper, which returns `setup()` plus the Testing Library render result

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/test/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { artistNames, formatTime, pickThumb, uniqueById } from '../src/format';

describe('formatTime', () => {
  it.each([
    [0, '0:00'],
    [5, '0:05'],
    [65.9, '1:05'],
    [3725, '1:02:05'],
    [Number.NaN, '0:00'],
    [-3, '0:00'],
  ])('%s -> %s', (sec, out) => {
    expect(formatTime(sec)).toBe(out);
  });
});

describe('artistNames', () => {
  it('joins names and falls back to Unknown artist', () => {
    expect(artistNames([{ name: 'A' }, { name: 'B' }])).toBe('A, B');
    expect(artistNames([])).toBe('Unknown artist');
    expect(artistNames([{ name: '' }])).toBe('Unknown artist');
  });
});

describe('pickThumb', () => {
  const thumbs = [
    { url: 'big', width: 544, height: 544 },
    { url: 'small', width: 60, height: 60 },
    { url: 'mid', width: 120, height: 120 },
  ];

  it('picks the smallest image at least the requested size', () => {
    expect(pickThumb(thumbs, 100)).toBe('mid');
  });

  it('falls back to the largest, or undefined when empty', () => {
    expect(pickThumb(thumbs, 2000)).toBe('big');
    expect(pickThumb([], 100)).toBeUndefined();
  });
});

describe('uniqueById', () => {
  it('keeps the first of each id', () => {
    expect(
      uniqueById([
        { id: 'a', n: 1 },
        { id: 'b', n: 2 },
        { id: 'a', n: 3 },
      ]).map((x) => x.n),
    ).toEqual([1, 2]);
  });
});
```

Create `packages/ui/test/useAsync.test.tsx`:

```tsx
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAsync } from '../src/hooks/useAsync';

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('useAsync', () => {
  it('is idle for a null key', () => {
    const { result } = renderHook(() => useAsync(null, async () => 1));
    expect(result.current.status).toBe('idle');
  });

  it('loads, then exposes data', async () => {
    const { result } = renderHook(() => useAsync('k', async () => 42));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready', data: 42 }));
  });

  it('wraps failures in SourceError', async () => {
    const { result } = renderHook(() =>
      useAsync('k', async () => {
        throw new Error('fetch failed');
      }),
    );
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.status === 'error' && result.current.error.kind).toBe('network');
  });

  it('drops a stale response after the key changes', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const loads: Record<string, Promise<string>> = { a: first.promise, b: second.promise };
    const { result, rerender } = renderHook(({ k }) => useAsync(k, () => loads[k] as Promise<string>), {
      initialProps: { k: 'a' },
    });
    rerender({ k: 'b' });
    await act(async () => {
      second.resolve('B');
    });
    await act(async () => {
      first.resolve('A');
    });
    expect(result.current).toMatchObject({ status: 'ready', data: 'B' });
  });

  it('retry loads again', async () => {
    const load = vi.fn(async () => 1);
    const { result } = renderHook(() => useAsync('k', load));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.retry());
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  });
});
```

Add to `packages/ui/test/helpers.tsx` (new imports at the top, plus the function at the bottom):

```tsx
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { PlayerProvider } from '../src/player/PlayerContext';
import { ServicesProvider } from '../src/services';

export function renderWithApp(ui: ReactElement, over: Parameters<typeof setup>[0] = {}) {
  const ctx = setup(over);
  const utils = render(
    <ServicesProvider services={{ source: ctx.source, storage: ctx.storage }}>
      <PlayerProvider controller={ctx.player}>{ui}</PlayerProvider>
    </ServicesProvider>,
  );
  return { ...ctx, ...utils };
}
```

Create `packages/ui/test/components.test.tsx`:

```tsx
import { SourceError } from '@breeze/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorState } from '../src/components/States';
import { TrackRow } from '../src/components/TrackRow';
import { t } from './helpers';

describe('TrackRow', () => {
  it('shows title, artists and duration, and plays on click', () => {
    const onPlay = vi.fn();
    render(<TrackRow track={t('a', { durationSec: 125 })} onPlay={onPlay} />);
    const row = screen.getByRole('button', { name: /Song a/ });
    expect(row.textContent).toContain('Artist a');
    expect(row.textContent).toContain('2:05');
    fireEvent.click(row);
    expect(onPlay).toHaveBeenCalledOnce();
  });

  it('handles missing artists, artwork and duration without placeholders leaking', () => {
    const { container } = render(<TrackRow track={t('b', { artists: [], thumbnails: [] })} onPlay={() => {}} />);
    expect(container.textContent).toContain('Unknown artist');
    expect(container.textContent).not.toContain('undefined');
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.art-empty')).not.toBeNull();
  });

  it('marks the playing row', () => {
    render(<TrackRow track={t('a')} active onPlay={() => {}} />);
    expect(screen.getByRole('button').getAttribute('aria-current')).toBe('true');
  });

  it('swaps a broken image for the placeholder', () => {
    const { container } = render(
      <TrackRow
        track={t('a', { thumbnails: [{ url: 'https://x/broken.jpg', width: 60, height: 60 }] })}
        onPlay={() => {}}
      />,
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    fireEvent.error(img as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();
  });
});

describe('ErrorState', () => {
  it('explains the error kind and retries', () => {
    const onRetry = vi.fn();
    render(<ErrorState error={new SourceError('network', 'fetch failed')} onRetry={onRetry} />);
    expect(screen.getByRole('alert').textContent).toContain("Can't reach YouTube Music");
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @breeze/ui test`
Expected: FAIL, cannot resolve `../src/format`, `../src/hooks/useAsync`, `../src/components/...` and `../src/player/PlayerContext`.

- [ ] **Step 3: Implement**

Create `packages/ui/src/format.ts`:

```ts
import type { ArtistRef, Thumbnail } from '@breeze/core';

export function formatTime(totalSec: number): string {
  if (!Number.isFinite(totalSec) || totalSec < 0) return '0:00';
  const s = Math.floor(totalSec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function artistNames(artists: ArtistRef[]): string {
  const names = artists.map((a) => a.name).filter(Boolean);
  return names.length > 0 ? names.join(', ') : 'Unknown artist';
}

/** Smallest image at least `size` px wide, else the largest available. */
export function pickThumb(thumbs: Thumbnail[], size: number): string | undefined {
  const sorted = [...thumbs].sort((a, b) => a.width - b.width);
  return (sorted.find((t) => t.width >= size) ?? sorted.at(-1))?.url;
}

export function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => !seen.has(item.id) && seen.add(item.id));
}
```

Create `packages/ui/src/hooks/useAsync.ts`:

```ts
import { type SourceError, toSourceError } from '@breeze/core';
import { useCallback, useEffect, useRef, useState } from 'react';

export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; error: SourceError };

/** Load data for `key`. A null key is idle; a newer key or retry drops the older result. */
export function useAsync<T>(key: string | null, load: () => Promise<T>): AsyncState<T> & { retry: () => void } {
  const loadRef = useRef(load);
  loadRef.current = load;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<AsyncState<T>>(key === null ? { status: 'idle' } : { status: 'loading' });
  const effectKey = key === null ? null : `${key}#${attempt}`;

  useEffect(() => {
    if (effectKey === null) {
      setState({ status: 'idle' });
      return;
    }
    let live = true;
    setState({ status: 'loading' });
    loadRef.current().then(
      (data) => {
        if (live) setState({ status: 'ready', data });
      },
      (error: unknown) => {
        if (live) setState({ status: 'error', error: toSourceError(error) });
      },
    );
    return () => {
      live = false;
    };
  }, [effectKey]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}
```

Create `packages/ui/src/hooks/useDebounced.ts`:

```ts
import { useEffect, useState } from 'react';

export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (ms <= 0) {
      setSettled(value);
      return;
    }
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return settled;
}
```

Create `packages/ui/src/player/PlayerContext.tsx`:

```tsx
import { createContext, type ReactNode, useContext, useSyncExternalStore } from 'react';
import type { PlayerController, PlayerState } from './controller';

const PlayerCtx = createContext<PlayerController | null>(null);

export function PlayerProvider({ controller, children }: { controller: PlayerController; children: ReactNode }) {
  return <PlayerCtx.Provider value={controller}>{children}</PlayerCtx.Provider>;
}

export function usePlayer(): { state: PlayerState; player: PlayerController } {
  const player = useContext(PlayerCtx);
  if (!player) throw new Error('usePlayer must be used inside <PlayerProvider>');
  const state = useSyncExternalStore(player.subscribe, player.getState);
  return { state, player };
}
```

Create `packages/ui/src/services.tsx`:

```tsx
import type { MusicSource, Storage } from '@breeze/core';
import { createContext, type ReactNode, useContext } from 'react';

export interface Services {
  source: MusicSource;
  storage: Storage;
}

const ServicesCtx = createContext<Services | null>(null);

export function ServicesProvider({ services, children }: { services: Services; children: ReactNode }) {
  return <ServicesCtx.Provider value={services}>{children}</ServicesCtx.Provider>;
}

export function useServices(): Services {
  const services = useContext(ServicesCtx);
  if (!services) throw new Error('useServices must be used inside <ServicesProvider>');
  return services;
}
```

Create `packages/ui/src/components/Artwork.tsx`:

```tsx
import type { Thumbnail } from '@breeze/core';
import { Music } from 'lucide-react';
import { useState } from 'react';
import { pickThumb } from '../format';

export function Artwork({ thumbnails, size, className }: { thumbnails: Thumbnail[]; size: number; className: string }) {
  const url = pickThumb(thumbnails, size * 2); // 2x for high-DPI screens
  const [failed, setFailed] = useState<string | null>(null);
  if (!url || failed === url) {
    return (
      <span className={`${className} art-empty`} aria-hidden="true">
        <Music size={Math.round(size / 2.4)} />
      </span>
    );
  }
  return (
    <img
      className={className}
      src={url}
      alt=""
      loading="lazy"
      width={size}
      height={size}
      onError={() => setFailed(url)}
    />
  );
}
```

Create `packages/ui/src/components/TrackRow.tsx`:

```tsx
import type { Track } from '@breeze/core';
import { artistNames, formatTime } from '../format';
import { Artwork } from './Artwork';

export interface TrackRowProps {
  track: Track;
  active?: boolean;
  onPlay: () => void;
}

export function TrackRow({ track, active = false, onPlay }: TrackRowProps) {
  return (
    <button
      type="button"
      className="track-row"
      data-active={active || undefined}
      aria-current={active ? 'true' : undefined}
      onClick={onPlay}
    >
      <Artwork thumbnails={track.thumbnails} size={40} className="track-art" />
      <span className="track-text">
        <span className="track-title">{track.title || 'Untitled'}</span>
        <span className="track-artist">{artistNames(track.artists)}</span>
      </span>
      <span className="track-duration">{track.durationSec ? formatTime(track.durationSec) : ''}</span>
    </button>
  );
}
```

Create `packages/ui/src/components/States.tsx`:

```tsx
import type { SourceError, SourceErrorKind } from '@breeze/core';

const ERROR_COPY: Record<SourceErrorKind, { title: string; body: string }> = {
  network: { title: "Can't reach YouTube Music", body: 'Check your internet connection, then try again.' },
  blocked: { title: 'YouTube is limiting requests', body: 'Wait a minute, then try again.' },
  not_found: { title: 'Not found', body: "This isn't available on YouTube Music." },
  parse: { title: 'Something went wrong', body: "YouTube Music sent something Breeze didn't expect. Try again." },
};

export function ErrorState({ error, onRetry }: { error: SourceError; onRetry: () => void }) {
  const copy = ERROR_COPY[error.kind];
  return (
    <div className="state" role="alert">
      <h2>{copy.title}</h2>
      <p>{copy.body}</p>
      <button type="button" className="btn" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="state">
      <h2>{title}</h2>
      <p>{body}</p>
    </div>
  );
}

const SKELETON_ROWS = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'];

export function RowsSkeleton() {
  return (
    <div className="skeleton" role="status" aria-label="Loading">
      {SKELETON_ROWS.map((id) => (
        <div key={id} className="skeleton-row" />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @breeze/ui test` then `pnpm typecheck`
Expected: all PASS; typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): add player and services contexts, data hooks and track row" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Screens, player bar, app shell, styles

**Files:**
- Create: `packages/ui/src/components/PlayerBar.tsx`, `ErrorToast.tsx`, `AppShell.tsx`
- Create: `packages/ui/src/screens/HomeScreen.tsx`, `SearchScreen.tsx`
- Create: `packages/ui/src/player/useMediaSession.ts`, `packages/ui/src/App.tsx`, `packages/ui/src/index.ts`, `packages/ui/src/styles.css`
- Test: `packages/ui/test/screens.test.tsx`, `packages/ui/test/mediaSession.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 3–4.
- Produces (from `@breeze/ui`):
  - `App({ player, services }: { player: PlayerController; services: Services })`
  - `AppShell()`, `HomeScreen()`, `SearchScreen({ debounceMs?: number })`, `PlayerBar()`, `ErrorToast()`
  - `useMediaSession(player: PlayerController, state: PlayerState): void`
  - Everything else, re-exported: `PlayerController`, `Emitter`, the engine types, `PlayerProvider`, `usePlayer`, `ServicesProvider`, `useServices`, `Services`
  - `@breeze/ui/styles.css`

Design direction: a calm, dark-first desktop player.
- **Colors:** deep slate background with one cool cyan accent. It follows the OS light/dark setting; the Settings toggle comes in Plan 3.
- **Type:** the native Windows font stack (Segoe UI Variable), so there's no web-font download.
- **Icons:** lucide.
- **Motion:** only the play-button press and the loading spinner. Both are disabled under `prefers-reduced-motion`.

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/test/screens.test.tsx`:

```tsx
import type { HomeSection, SearchResult } from '@breeze/core';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorToast } from '../src/components/ErrorToast';
import { PlayerBar } from '../src/components/PlayerBar';
import { HomeScreen } from '../src/screens/HomeScreen';
import { SearchScreen } from '../src/screens/SearchScreen';
import { flush, renderWithApp, t } from './helpers';

const songs = (...ids: string[]): SearchResult => ({
  songs: ids.map((id) => t(id)),
  albums: [],
  artists: [],
  playlists: [],
});

describe('SearchScreen', () => {
  it('prompts before typing', () => {
    renderWithApp(<SearchScreen debounceMs={0} />);
    expect(screen.getByText('Find something to play')).toBeTruthy();
  });

  it('searches songs and plays the clicked one in context', async () => {
    const search = vi.fn(async () => songs('a', 'b'));
    const { engine } = renderWithApp(<SearchScreen debounceMs={0} />, { source: { search } });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search songs' }), { target: { value: ' daft ' } });
    fireEvent.click(await screen.findByRole('button', { name: /Song b/ }));
    await flush();
    expect(search).toHaveBeenCalledWith('daft', 'songs');
    expect(engine.loaded).toEqual(['b']);
  });

  it('says when nothing matched', async () => {
    renderWithApp(<SearchScreen debounceMs={0} />, { source: { search: async () => songs() } });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzzz' } });
    expect(await screen.findByText('No songs found')).toBeTruthy();
  });

  it('shows the error and retries', async () => {
    const search = vi.fn(async () => {
      throw new Error('fetch failed');
    });
    renderWithApp(<SearchScreen debounceMs={0} />, { source: { search } });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'x' } });
    expect((await screen.findByRole('alert')).textContent).toContain("Can't reach YouTube Music");
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(search).toHaveBeenCalledTimes(2));
  });

  it('returns to the prompt when the box is cleared', async () => {
    renderWithApp(<SearchScreen debounceMs={0} />, { source: { search: async () => songs('a') } });
    const box = screen.getByRole('searchbox');
    fireEvent.change(box, { target: { value: 'a' } });
    await screen.findByRole('button', { name: /Song a/ });
    fireEvent.change(box, { target: { value: '  ' } });
    expect(await screen.findByText('Find something to play')).toBeTruthy();
  });
});

describe('HomeScreen', () => {
  it('shows sections that contain songs and plays within the section', async () => {
    const home: HomeSection[] = [
      {
        title: 'Quick picks',
        items: [
          { kind: 'track', track: t('a') },
          { kind: 'album', album: { id: 'al', title: 'Album', thumbnails: [] } },
          { kind: 'track', track: t('b') },
        ],
      },
      { title: 'Albums only', items: [{ kind: 'album', album: { id: 'al2', title: 'X', thumbnails: [] } }] },
    ];
    const { engine, player } = renderWithApp(<HomeScreen />, { source: { home: async () => home } });
    expect(await screen.findByText('Quick picks')).toBeTruthy();
    expect(screen.queryByText('Albums only')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Song b/ }));
    await flush();
    expect(engine.loaded).toEqual(['b']);
    expect(player.getState().queue.tracks.map((x) => x.id)).toEqual(['a', 'b']);
  });
});

describe('PlayerBar', () => {
  it('starts empty, then shows the playing track and controls', async () => {
    const { player } = renderWithApp(<PlayerBar />);
    expect(screen.getByText('Nothing playing')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Play' }) as HTMLButtonElement).disabled).toBe(true);
    await act(() => player.playTracks([t('a', { artists: [] })]));
    expect(screen.getByText('Song a')).toBeTruthy();
    expect(screen.getByText('Unknown artist')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
  });

  it('cycles the repeat label', () => {
    renderWithApp(<PlayerBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Repeat: off' }));
    expect(screen.getByRole('button', { name: 'Repeat: all' })).toBeTruthy();
  });
});

describe('ErrorToast', () => {
  it('shows playback errors and can be dismissed', async () => {
    const { engine, player } = renderWithApp(<ErrorToast />);
    engine.failIds.add('a');
    await act(() => player.playTracks([t('a')]));
    expect(screen.getByRole('status').textContent).toContain('YouTube is limiting requests');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
```

Create `packages/ui/test/mediaSession.test.tsx`:

```tsx
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlayerProvider, usePlayer } from '../src/player/PlayerContext';
import { useMediaSession } from '../src/player/useMediaSession';
import { flush, setup, t } from './helpers';

describe('useMediaSession', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('publishes metadata and wires OS media keys', async () => {
    const handlers = new Map<string, ((d: { seekTime?: number }) => void) | null>();
    const session = {
      metadata: null as unknown,
      playbackState: 'none',
      setActionHandler: (action: string, h: ((d: { seekTime?: number }) => void) | null) => handlers.set(action, h),
    };
    Object.defineProperty(navigator, 'mediaSession', { value: session, configurable: true });
    vi.stubGlobal(
      'MediaMetadata',
      class {
        constructor(public init: { title: string; artist: string }) {}
      },
    );
    const ctx = setup();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <PlayerProvider controller={ctx.player}>{children}</PlayerProvider>
    );
    renderHook(
      () => {
        const { player, state } = usePlayer();
        useMediaSession(player, state);
      },
      { wrapper },
    );

    await act(() => ctx.player.playTracks([t('a'), t('b')]));
    expect((session.metadata as { init: { title: string } }).init.title).toBe('Song a');
    expect(session.playbackState).toBe('playing');

    await act(async () => {
      handlers.get('nexttrack')?.({});
      await flush();
    });
    expect(ctx.engine.loaded).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @breeze/ui test screens mediaSession`
Expected: FAIL, cannot resolve the screen, component and hook modules.

- [ ] **Step 3: Implement components and screens**

Create `packages/ui/src/components/PlayerBar.tsx`:

```tsx
import { current } from '@breeze/core';
import { Loader2, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { artistNames, formatTime } from '../format';
import { usePlayer } from '../player/PlayerContext';
import { Artwork } from './Artwork';

export function PlayerBar() {
  const { state, player } = usePlayer();
  const track = current(state.queue);
  const { repeat, shuffled } = state.queue;
  const playing = state.status === 'playing';
  const RepeatIcon = repeat === 'one' ? Repeat1 : Repeat;

  return (
    <footer className="player-bar" aria-label="Player">
      <div className="now-playing">
        {track ? (
          <>
            <Artwork thumbnails={track.thumbnails} size={48} className="np-art" />
            <div className="np-text">
              <span className="np-title">{track.title || 'Untitled'}</span>
              <span className="np-artist">{artistNames(track.artists)}</span>
            </div>
          </>
        ) : (
          <span className="np-empty">Nothing playing</span>
        )}
      </div>

      <div className="transport">
        <div className="transport-buttons">
          <button
            type="button"
            className="icon-btn"
            aria-label="Shuffle"
            aria-pressed={shuffled}
            onClick={() => player.toggleShuffle()}
          >
            <Shuffle size={18} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Previous"
            disabled={!track}
            onClick={() => void player.prev()}
          >
            <SkipBack size={20} />
          </button>
          <button
            type="button"
            className="icon-btn play-btn"
            aria-label={playing ? 'Pause' : 'Play'}
            disabled={!track}
            onClick={() => player.playPause()}
          >
            {state.status === 'loading' ? (
              <Loader2 size={22} className="spin" />
            ) : playing ? (
              <Pause size={22} />
            ) : (
              <Play size={22} />
            )}
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Next"
            disabled={!track}
            onClick={() => void player.next()}
          >
            <SkipForward size={20} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={`Repeat: ${repeat}`}
            aria-pressed={repeat !== 'off'}
            onClick={() => player.cycleRepeat()}
          >
            <RepeatIcon size={18} />
          </button>
        </div>
        <div className="seek">
          <span className="time">{formatTime(state.position)}</span>
          <input
            type="range"
            aria-label="Seek"
            min={0}
            max={Math.max(state.duration, 1)}
            step={1}
            value={Math.min(state.position, state.duration)}
            disabled={!track || state.duration === 0}
            onChange={(e) => player.seek(Number(e.currentTarget.value))}
          />
          <span className="time">{formatTime(state.duration)}</span>
        </div>
      </div>

      <div className="volume">
        <button
          type="button"
          className="icon-btn"
          aria-label={state.volume === 0 ? 'Unmute' : 'Mute'}
          onClick={() => player.toggleMute()}
        >
          {state.volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
        <input
          type="range"
          aria-label="Volume"
          min={0}
          max={1}
          step={0.01}
          value={state.volume}
          onChange={(e) => player.setVolume(Number(e.currentTarget.value))}
        />
      </div>
    </footer>
  );
}
```

Create `packages/ui/src/components/ErrorToast.tsx`:

```tsx
import { X } from 'lucide-react';
import { useEffect } from 'react';
import { usePlayer } from '../player/PlayerContext';

const TOAST_MS = 6000;

export function ErrorToast() {
  const { state, player } = usePlayer();
  const { error } = state;

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => player.dismissError(), TOAST_MS);
    return () => clearTimeout(id);
  }, [error, player]);

  if (!error) return null;
  return (
    <div className="toast" role="status">
      <span>{error}</span>
      <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => player.dismissError()}>
        <X size={16} />
      </button>
    </div>
  );
}
```

Create `packages/ui/src/screens/HomeScreen.tsx`:

```tsx
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
```

Create `packages/ui/src/screens/SearchScreen.tsx`:

```tsx
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
```

Create `packages/ui/src/components/AppShell.tsx`:

```tsx
import { House, type LucideIcon, Search, Wind } from 'lucide-react';
import { useState } from 'react';
import { HomeScreen } from '../screens/HomeScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { ErrorToast } from './ErrorToast';
import { PlayerBar } from './PlayerBar';

type Route = 'home' | 'search';

const NAV: { route: Route; label: string; icon: LucideIcon }[] = [
  { route: 'home', label: 'Home', icon: House },
  { route: 'search', label: 'Search', icon: Search },
];

export function AppShell() {
  const [route, setRoute] = useState<Route>('home');
  return (
    <div className="app">
      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          <Wind size={22} aria-hidden="true" />
          Breeze
        </div>
        {NAV.map(({ route: r, label, icon: Icon }) => (
          <button
            key={r}
            type="button"
            className="nav-btn"
            aria-current={route === r ? 'page' : undefined}
            onClick={() => setRoute(r)}
          >
            <Icon size={20} aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>
      <main className="content">{route === 'home' ? <HomeScreen /> : <SearchScreen />}</main>
      <PlayerBar />
      <ErrorToast />
    </div>
  );
}
```

Create `packages/ui/src/player/useMediaSession.ts`:

```ts
import { current } from '@breeze/core';
import { useEffect } from 'react';
import { artistNames } from '../format';
import type { PlayerController, PlayerState } from './controller';

/** Windows media keys and the system media overlay, via the Media Session API. */
export function useMediaSession(player: PlayerController, state: PlayerState): void {
  const track = current(state.queue);

  useEffect(() => {
    const session = navigator.mediaSession;
    if (!session) return;
    const actions: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => player.resume()],
      ['pause', () => player.pause()],
      ['previoustrack', () => void player.prev()],
      ['nexttrack', () => void player.next()],
      [
        'seekto',
        (details) => {
          if (details.seekTime != null) player.seek(details.seekTime);
        },
      ],
    ];
    for (const [action, handler] of actions) session.setActionHandler(action, handler);
    return () => {
      for (const [action] of actions) session.setActionHandler(action, null);
    };
  }, [player]);

  useEffect(() => {
    const session = navigator.mediaSession;
    if (!session || typeof MediaMetadata === 'undefined') return;
    session.metadata = track
      ? new MediaMetadata({
          title: track.title,
          artist: artistNames(track.artists),
          album: track.album?.name ?? '',
          artwork: track.thumbnails
            .filter((t) => t.width > 0)
            .map((t) => ({ src: t.url, sizes: `${t.width}x${t.height}` })),
        })
      : null;
  }, [track]);

  useEffect(() => {
    const session = navigator.mediaSession;
    if (!session) return;
    session.playbackState = state.status === 'playing' ? 'playing' : state.status === 'idle' ? 'none' : 'paused';
  }, [state.status]);
}
```

Create `packages/ui/src/App.tsx`:

```tsx
import { AppShell } from './components/AppShell';
import type { PlayerController } from './player/controller';
import { PlayerProvider, usePlayer } from './player/PlayerContext';
import { useMediaSession } from './player/useMediaSession';
import { type Services, ServicesProvider } from './services';

export function App({ player, services }: { player: PlayerController; services: Services }) {
  return (
    <ServicesProvider services={services}>
      <PlayerProvider controller={player}>
        <MediaSessionBridge />
        <AppShell />
      </PlayerProvider>
    </ServicesProvider>
  );
}

function MediaSessionBridge() {
  const { player, state } = usePlayer();
  useMediaSession(player, state);
  return null;
}
```

Create `packages/ui/src/index.ts`:

```ts
export { App } from './App';
export { AppShell } from './components/AppShell';
export * from './player';
export { PlayerProvider, usePlayer } from './player/PlayerContext';
export { useMediaSession } from './player/useMediaSession';
export { type Services, ServicesProvider, useServices } from './services';
```

Create `packages/ui/src/styles.css`:

```css
:root {
  color-scheme: dark;
  --bg: #0e1116;
  --surface: #151a21;
  --surface-2: #1d242e;
  --border: #29323e;
  --text: #e8edf3;
  --text-muted: #95a3b3;
  --accent: #5cc8d6;
  --danger: #f2777a;
  --font: "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, sans-serif;
  --player-h: 88px;
}

@media (prefers-color-scheme: light) {
  :root {
    color-scheme: light;
    --bg: #f5f7f9;
    --surface: #ffffff;
    --surface-2: #eceff3;
    --border: #d6dce3;
    --text: #121820;
    --text-muted: #56626e;
    --accent: #0d7a87;
    --danger: #b3261e;
  }
}

* {
  box-sizing: border-box;
}

html,
body,
#root {
  height: 100%;
  margin: 0;
}

body {
  background: var(--bg);
  color: var(--text);
  font: 14px / 1.45 var(--font);
  -webkit-font-smoothing: antialiased;
}

button {
  font: inherit;
  color: inherit;
}

:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.app {
  display: grid;
  grid-template-columns: 220px 1fr;
  grid-template-rows: 1fr var(--player-h);
  height: 100%;
}

.sidebar {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 20px 12px;
  background: var(--surface);
  border-right: 1px solid var(--border);
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px 18px;
  font-size: 18px;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.brand svg {
  color: var(--accent);
}

.nav-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 10px;
  border: 0;
  border-radius: 8px;
  background: none;
  color: var(--text-muted);
  text-align: left;
  cursor: pointer;
}

.nav-btn:hover,
.nav-btn[aria-current="page"] {
  background: var(--surface-2);
  color: var(--text);
}

.nav-btn[aria-current="page"] {
  font-weight: 600;
}

.content {
  overflow-y: auto;
  padding: 28px 32px 40px;
}

.screen-title {
  margin: 0 0 20px;
  font-size: 26px;
  font-weight: 650;
  letter-spacing: -0.02em;
}

.shelf {
  margin-bottom: 32px;
}

.shelf-title {
  margin: 0 0 10px;
  font-size: 16px;
  font-weight: 600;
}

.track-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 2px 16px;
}

.track-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-width: 860px;
}

.track-row {
  display: grid;
  grid-template-columns: 40px 1fr auto;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: 8px;
  background: none;
  text-align: left;
  cursor: pointer;
}

.track-row:hover {
  background: var(--surface-2);
}

.track-row[data-active] .track-title {
  color: var(--accent);
}

.track-art,
.np-art {
  border-radius: 6px;
  object-fit: cover;
  background: var(--surface-2);
}

.track-art {
  width: 40px;
  height: 40px;
}

.np-art {
  flex: none;
  width: 48px;
  height: 48px;
}

.art-empty {
  display: grid;
  place-items: center;
  color: var(--text-muted);
}

.track-text,
.np-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.track-title,
.np-title,
.track-artist,
.np-artist {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.track-title,
.np-title {
  font-weight: 500;
}

.track-artist,
.np-artist {
  color: var(--text-muted);
  font-size: 13px;
}

.track-duration,
.time {
  color: var(--text-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 560px;
  margin-bottom: 24px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-muted);
}

.search-box:focus-within {
  border-color: var(--accent);
}

.search-box input {
  flex: 1;
  height: 42px;
  border: 0;
  background: none;
  color: var(--text);
  font: inherit;
  font-size: 15px;
  outline: none;
}

.player-bar {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(320px, 2fr) minmax(140px, 1fr);
  align-items: center;
  gap: 16px;
  padding: 0 20px;
  background: var(--surface);
  border-top: 1px solid var(--border);
}

.now-playing {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.np-empty {
  color: var(--text-muted);
}

.transport {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.transport-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}

.icon-btn {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 50%;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
}

.icon-btn:hover:not(:disabled) {
  background: var(--surface-2);
  color: var(--text);
}

.icon-btn[aria-pressed="true"] {
  color: var(--accent);
}

.icon-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.play-btn,
.play-btn:hover:not(:disabled) {
  width: 40px;
  height: 40px;
  background: var(--text);
  color: var(--bg);
}

.play-btn:active:not(:disabled) {
  transform: scale(0.96);
}

.seek {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  max-width: 560px;
}

.seek input {
  flex: 1;
}

.volume {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

.volume input {
  width: 110px;
}

input[type="range"] {
  accent-color: var(--accent);
}

.state {
  max-width: 420px;
  padding: 48px 0;
}

.state h2 {
  margin: 0 0 6px;
  font-size: 17px;
}

.state p {
  margin: 0 0 16px;
  color: var(--text-muted);
}

.btn {
  padding: 8px 16px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-2);
  cursor: pointer;
}

.btn:hover {
  border-color: var(--accent);
}

.skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 860px;
}

.skeleton-row {
  height: 52px;
  border-radius: 8px;
  background: var(--surface-2);
  animation: pulse 1.4s ease-in-out infinite;
}

.toast {
  position: fixed;
  left: 50%;
  bottom: calc(var(--player-h) + 16px);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 10px 10px 16px;
  border: 1px solid var(--border);
  border-left: 3px solid var(--danger);
  border-radius: 10px;
  background: var(--surface-2);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.3);
  transform: translateX(-50%);
}

.spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes pulse {
  50% {
    opacity: 0.55;
  }
}

@media (prefers-reduced-motion: reduce) {
  .spin,
  .skeleton-row {
    animation: none;
  }

  .play-btn:active:not(:disabled) {
    transform: none;
  }
}
```

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `pnpm --filter @breeze/ui test`, then `pnpm typecheck`, then `pnpm lint:fix` and `pnpm lint`.
Expected:
- All UI tests pass.
- Typecheck exits 0.
- `pnpm lint` reports no errors.

If Biome reports an a11y or `useExhaustiveDependencies` violation, fix the code rather than disabling the rule. Then check contrast with `mcp__plugin_antislop_antislop-contrast__check_contrast`, in both themes:
- `--text-muted` on `--bg` and on `--surface`: at least 4.5:1.
- `--accent` on `--bg`: at least 3:1 (UI elements).
- `--text` on `--surface-2` (the toast): at least 4.5:1.

- [ ] **Step 5: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): add home, search, player bar, toast, media session and styles" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Desktop package + JSON file storage

**Files:**
- Create: `apps/desktop/package.json`, `apps/desktop/tsconfig.json`, `apps/desktop/src/main/storage.ts`, `apps/desktop/test/storage.test.ts`
- Modify: root `package.json` (`pnpm.onlyBuiltDependencies`, `dev:desktop` script)

**Interfaces:**
- Consumes: `Storage`, `DEFAULT_SETTINGS`, `HISTORY_LIMIT`, `pushHistory`, `LocalPlaylist`, `Settings`, `Track` from `@breeze/core`.
- Produces: `class JsonFileStorage implements Storage { constructor(dir: string) }`. It keeps one `library.json` in `dir`, writes atomically, serialises writes, and backs up a corrupt file as `library.corrupt-<ms>.json`.

- [ ] **Step 1: Scaffold**

Create `apps/desktop/package.json`:

```json
{
  "name": "@breeze/desktop",
  "productName": "Breeze",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "start": "electron-vite preview",
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p ."
  }
}
```

Create `apps/desktop/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "jsx": "react-jsx", "types": ["node"] },
  "include": ["src", "test", "electron.vite.config.ts"]
}
```

Modify root `package.json`. Add `"dev:desktop": "pnpm --filter @breeze/desktop dev"` to `scripts`, and add a top-level field:

```json
"pnpm": { "onlyBuiltDependencies": ["electron", "esbuild"] }
```

This lets pnpm 10 run the Electron binary download.

Run:

```bash
pnpm --filter @breeze/desktop add youtubei.js react react-dom
pnpm --filter @breeze/desktop add -D @breeze/core@workspace:* @breeze/ui@workspace:* electron electron-vite vite @vitejs/plugin-react typescript vitest @types/node @types/react @types/react-dom
```

Expected: both succeed, and the Electron binary downloads (about 100 MB). `@breeze/core` and `@breeze/ui` sit in `devDependencies` on purpose: electron-vite bundles dev dependencies into main and preload, while `youtubei.js` stays an external runtime dependency.

- [ ] **Step 2: Write the failing test**

Create `apps/desktop/test/storage.test.ts`:

```ts
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
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter @breeze/desktop test`
Expected: FAIL, cannot resolve `../src/main/storage`.

- [ ] **Step 4: Implement**

Create `apps/desktop/src/main/storage.ts`:

```ts
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
```

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @breeze/desktop test` then `pnpm typecheck`
Expected: all PASS; typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop package.json pnpm-lock.yaml
git commit -m "feat(desktop): scaffold Electron app and atomic JSON storage" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Typed IPC contract

**Files:**
- Create: `apps/desktop/src/shared/ipc.ts`, `apps/desktop/src/shared/result.ts`
- Create: `apps/desktop/src/main/ipc.ts`, `apps/desktop/src/main/services.ts`
- Create: `apps/desktop/src/renderer/src/ipc-adapters.ts`
- Test: `apps/desktop/test/ipc.test.ts`

**Interfaces:**
- Consumes: `MusicSource`, `Storage`, `AudioQuality`, `SourceError`, `toSourceError`, `MemoryStorage` (`@breeze/core`); `InnerTubeSource` (`@breeze/core/innertube`); `StreamResolver`, `StreamInfo` (`@breeze/core/stream`).
- Produces:
  - `shared/result.ts`:
    - `type Result<T> = { ok: true; value: T } | { ok: false; error: { kind: SourceErrorKind; message: string } }`
    - `toResult<T>(fn: () => Promise<T>): Promise<Result<T>>`
    - `unwrap<T>(r: Result<T>): T` (throws `SourceError`)
  - `shared/ipc.ts` (types and constants only, safe for the sandboxed preload):
    - `type Methods = MusicSource & Storage & { resolveStream(id: string, quality: AudioQuality): Promise<StreamInfo> }`
    - `type MethodName = keyof Methods`
    - `METHOD_NAMES: readonly MethodName[]`
    - `channel(name: MethodName): string`
    - `type BreezeApi = { [K in MethodName]: (...args: Parameters<Methods[K]>) => Promise<Result<Awaited<ReturnType<Methods[K]>>>> }`
  - `main/ipc.ts`:
    - `interface IpcHandle { handle(channel: string, listener: (event: unknown, ...args: any[]) => unknown): void }`
    - `registerIpc(ipc: IpcHandle, impl: Methods): void`
  - `main/services.ts`:
    - `interface Factories { source(): Promise<MusicSource>; streams(): Promise<{ resolve(id: string, q: AudioQuality): Promise<StreamInfo> }> }`
    - `createServices(storage: Storage, factories?: Factories): Methods`. It connects lazily, shares one connection, and retries the connection after a failure.
  - `renderer/src/ipc-adapters.ts`: `ipcSource(api): MusicSource`, `ipcStorage(api): Storage`, `ipcStreams(api): { resolve(id: string, quality: AudioQuality): Promise<StreamInfo> }`

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/test/ipc.test.ts`:

```ts
import { MemoryStorage, type MusicSource, SourceError } from '@breeze/core';
import type { StreamInfo } from '@breeze/core/stream';
import { describe, expect, it, vi } from 'vitest';
import { type IpcHandle, registerIpc } from '../src/main/ipc';
import { createServices, type Factories } from '../src/main/services';
import { ipcSource, ipcStorage, ipcStreams } from '../src/renderer/src/ipc-adapters';
import { type BreezeApi, channel, METHOD_NAMES, type Methods } from '../src/shared/ipc';

const track = { id: 'a', title: 'A', artists: [], thumbnails: [] };
const stream: StreamInfo = { url: 'https://x', mimeType: 'audio/mp4', bitrate: 1, expiresAt: 2 };

function source(over: Partial<MusicSource> = {}): MusicSource {
  const missing = () => Promise.reject(new Error('not stubbed'));
  return {
    home: missing,
    search: missing,
    track: async () => track,
    album: missing,
    artist: missing,
    playlist: missing,
    upNext: missing,
    ...over,
  };
}

const factories = (src: MusicSource = source()): Factories => ({
  source: async () => src,
  streams: async () => ({ resolve: async () => stream }),
});

/** Wire main handlers to a renderer-side api, cloning like Electron's structured clone. */
function connect(impl: Methods): { api: BreezeApi; handlers: Map<string, (...a: unknown[]) => unknown> } {
  const handlers = new Map<string, (...a: unknown[]) => unknown>();
  const ipc: IpcHandle = {
    handle: (c, h) => {
      handlers.set(c, h);
    },
  };
  registerIpc(ipc, impl);
  const api = Object.fromEntries(
    METHOD_NAMES.map((name) => [
      name,
      async (...args: unknown[]) => structuredClone(await handlers.get(channel(name))?.({}, ...structuredClone(args))),
    ]),
  ) as BreezeApi;
  return { api, handlers };
}

describe('IPC contract', () => {
  it('registers one handler per method', () => {
    const { handlers } = connect(createServices(new MemoryStorage(), factories()));
    expect(handlers.size).toBe(METHOD_NAMES.length);
  });

  it('round-trips source, storage and stream calls', async () => {
    const { api } = connect(createServices(new MemoryStorage(), factories()));
    expect(await ipcSource(api).track('a')).toEqual(track);
    await ipcStorage(api).addHistory(track);
    expect(await ipcStorage(api).getHistory(5)).toEqual([track]);
    expect(await ipcStreams(api).resolve('a', 'high')).toEqual(stream);
  });

  it('keeps the SourceError kind across the process boundary', async () => {
    const failing = source({
      search: async () => {
        throw new Error('Request to https://x failed with status code 429');
      },
    });
    const { api } = connect(createServices(new MemoryStorage(), factories(failing)));
    const err = await ipcSource(api)
      .search('x')
      .catch((e) => e);
    expect(err).toBeInstanceOf(SourceError);
    expect(err.kind).toBe('blocked');
    expect(err.message).toContain('429');
  });

  it('preserves `this` for class-based implementations', async () => {
    class Impl {
      private readonly secret = 'kept';
      async track() {
        return { ...track, title: this.secret };
      }
    }
    const impl = new Impl();
    const { api } = connect(createServices(new MemoryStorage(), factories(source({ track: () => impl.track() }))));
    expect((await ipcSource(api).track('a')).title).toBe('kept');
  });
});

describe('createServices', () => {
  it('connects once and reuses the connection', async () => {
    const make = vi.fn(async () => source());
    const svc = createServices(new MemoryStorage(), { ...factories(), source: make });
    await svc.track('a');
    await svc.track('a');
    expect(make).toHaveBeenCalledTimes(1);
  });

  it('retries the connection after a failed start', async () => {
    const make = vi
      .fn<() => Promise<MusicSource>>()
      .mockRejectedValueOnce(new SourceError('network', 'offline'))
      .mockResolvedValue(source());
    const svc = createServices(new MemoryStorage(), { ...factories(), source: make });
    await expect(svc.track('a')).rejects.toMatchObject({ kind: 'network' });
    expect(await svc.track('a')).toEqual(track);
    expect(make).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @breeze/desktop test ipc`
Expected: FAIL, the modules under `src/shared`, `src/main` and `src/renderer` cannot be resolved.

- [ ] **Step 3: Implement**

Create `apps/desktop/src/shared/result.ts`:

```ts
import { SourceError, type SourceErrorKind, toSourceError } from '@breeze/core';

/** IPC drops Error subclasses and custom fields, so errors cross as plain data. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: { kind: SourceErrorKind; message: string } };

export async function toResult<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    const err = toSourceError(e);
    return { ok: false, error: { kind: err.kind, message: err.message } };
  }
}

export function unwrap<T>(r: Result<T>): T {
  if (r.ok) return r.value;
  throw new SourceError(r.error.kind, r.error.message);
}
```

Create `apps/desktop/src/shared/ipc.ts`:

```ts
// Types and constants only: the sandboxed preload imports this file.
import type { AudioQuality, MusicSource, Storage } from '@breeze/core';
import type { StreamInfo } from '@breeze/core/stream';
import type { Result } from './result';

export type Methods = MusicSource &
  Storage & {
    resolveStream(id: string, quality: AudioQuality): Promise<StreamInfo>;
  };

export type MethodName = keyof Methods;

export const METHOD_NAMES = [
  'home',
  'search',
  'track',
  'album',
  'artist',
  'playlist',
  'upNext',
  'getPlaylists',
  'savePlaylist',
  'deletePlaylist',
  'getSettings',
  'saveSettings',
  'addHistory',
  'getHistory',
  'resolveStream',
] as const satisfies readonly MethodName[];

/** Compile-time check that METHOD_NAMES lists every method. */
export const METHOD_NAMES_COMPLETE: [Exclude<MethodName, (typeof METHOD_NAMES)[number]>] extends [never]
  ? true
  : false = true;

export const channel = (name: MethodName): string => `breeze:${name}`;

export type BreezeApi = {
  [K in MethodName]: (...args: Parameters<Methods[K]>) => Promise<Result<Awaited<ReturnType<Methods[K]>>>>;
};
```

Create `apps/desktop/src/main/ipc.ts`:

```ts
import { channel, METHOD_NAMES, type Methods } from '../shared/ipc';
import { toResult } from '../shared/result';

/** The part of Electron's ipcMain this module uses (kept structural for tests). */
export interface IpcHandle {
  handle(channel: string, listener: (event: unknown, ...args: any[]) => unknown): void;
}

export function registerIpc(ipc: IpcHandle, impl: Methods): void {
  for (const name of METHOD_NAMES) {
    const fn = impl[name] as (...args: unknown[]) => Promise<unknown>;
    ipc.handle(channel(name), (_event, ...args: unknown[]) => toResult(() => fn.apply(impl, args)));
  }
}
```

Create `apps/desktop/src/main/services.ts`:

```ts
import type { AudioQuality, MusicSource, Storage } from '@breeze/core';
import { InnerTubeSource } from '@breeze/core/innertube';
import { type StreamInfo, StreamResolver } from '@breeze/core/stream';
import type { Methods } from '../shared/ipc';

export interface Factories {
  source(): Promise<MusicSource>;
  streams(): Promise<{ resolve(id: string, quality: AudioQuality): Promise<StreamInfo> }>;
}

const YOUTUBE: Factories = {
  source: () => InnerTubeSource.create(),
  streams: () => StreamResolver.create(),
};

/** Connect on first use, share the connection, and try again next call if connecting failed. */
function lazy<T>(make: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => {
    pending ??= make().catch((e) => {
      pending = null;
      throw e;
    });
    return pending;
  };
}

export function createServices(storage: Storage, factories: Factories = YOUTUBE): Methods {
  const source = lazy(factories.source);
  const streams = lazy(factories.streams);
  return {
    home: async () => (await source()).home(),
    search: async (query, filter) => (await source()).search(query, filter),
    track: async (id) => (await source()).track(id),
    album: async (id) => (await source()).album(id),
    artist: async (id) => (await source()).artist(id),
    playlist: async (id) => (await source()).playlist(id),
    upNext: async (id) => (await source()).upNext(id),
    resolveStream: async (id, quality) => (await streams()).resolve(id, quality),
    getPlaylists: () => storage.getPlaylists(),
    savePlaylist: (p) => storage.savePlaylist(p),
    deletePlaylist: (id) => storage.deletePlaylist(id),
    getSettings: () => storage.getSettings(),
    saveSettings: (s) => storage.saveSettings(s),
    addHistory: (t) => storage.addHistory(t),
    getHistory: (limit) => storage.getHistory(limit),
  };
}
```

Create `apps/desktop/src/renderer/src/ipc-adapters.ts`:

```ts
import type { AudioQuality, MusicSource, Storage } from '@breeze/core';
import type { StreamInfo } from '@breeze/core/stream';
import type { BreezeApi } from '../../shared/ipc';
import { unwrap } from '../../shared/result';

export function ipcSource(api: BreezeApi): MusicSource {
  return {
    home: async () => unwrap(await api.home()),
    search: async (query, filter) => unwrap(await api.search(query, filter)),
    track: async (id) => unwrap(await api.track(id)),
    album: async (id) => unwrap(await api.album(id)),
    artist: async (id) => unwrap(await api.artist(id)),
    playlist: async (id) => unwrap(await api.playlist(id)),
    upNext: async (id) => unwrap(await api.upNext(id)),
  };
}

export function ipcStorage(api: BreezeApi): Storage {
  return {
    getPlaylists: async () => unwrap(await api.getPlaylists()),
    savePlaylist: async (p) => unwrap(await api.savePlaylist(p)),
    deletePlaylist: async (id) => unwrap(await api.deletePlaylist(id)),
    getSettings: async () => unwrap(await api.getSettings()),
    saveSettings: async (s) => unwrap(await api.saveSettings(s)),
    addHistory: async (t) => unwrap(await api.addHistory(t)),
    getHistory: async (limit) => unwrap(await api.getHistory(limit)),
  };
}

export function ipcStreams(api: BreezeApi): { resolve(id: string, quality: AudioQuality): Promise<StreamInfo> } {
  return { resolve: async (id, quality) => unwrap(await api.resolveStream(id, quality)) };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @breeze/desktop test` then `pnpm typecheck`
Expected: all PASS; typecheck exits 0. If `METHOD_NAMES_COMPLETE` fails to typecheck, a method is missing from `METHOD_NAMES`. Add it.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop
git commit -m "feat(desktop): typed IPC contract that keeps SourceError kinds" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: HtmlAudioEngine

**Files:**
- Create: `apps/desktop/src/renderer/src/html-audio-engine.ts`, `apps/desktop/test/html-audio-engine.test.ts`

**Interfaces:**
- Consumes: `AudioEngine`, `EngineEvents`, `Emitter` (`@breeze/ui/player`); `Track`, `AudioQuality`; `StreamInfo` (type).
- Produces:
  - `interface StreamSource { resolve(id: string, quality: AudioQuality): Promise<StreamInfo> }`
  - `class HtmlAudioEngine implements AudioEngine { constructor(streams: StreamSource, quality: () => AudioQuality, audio?: HTMLAudioElement) }`
  - Behaviour:
    - Re-resolves once on a media error or an expired URL, keeping the position.
    - Ignores `AbortError` from `play()`.
    - Drops a stale load.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/test/html-audio-engine.test.ts`:

```ts
import type { Track } from '@breeze/core';
import type { StreamInfo } from '@breeze/core/stream';
import { describe, expect, it, vi } from 'vitest';
import { HtmlAudioEngine, type StreamSource } from '../src/renderer/src/html-audio-engine';

class FakeAudio extends EventTarget {
  src = '';
  currentTime = 0;
  duration = Number.NaN;
  volume = 1;
  preload = '';
  error: unknown = null;
  play = vi.fn(async () => {});
  pause = vi.fn();
}

const t = (id: string): Track => ({ id, title: id, artists: [], thumbnails: [] });
const flush = () => new Promise((r) => setTimeout(r, 0));
const info = (url: string, expiresAt = Date.now() + 3_600_000): StreamInfo => ({
  url,
  mimeType: 'audio/mp4',
  bitrate: 1,
  expiresAt,
});

function make(resolve: StreamSource['resolve']) {
  const audio = new FakeAudio();
  const streams = { resolve: vi.fn(resolve) };
  const engine = new HtmlAudioEngine(streams, () => 'medium', audio as unknown as HTMLAudioElement);
  const errors: unknown[] = [];
  engine.on('error', (e) => errors.push(e));
  return { audio, streams, engine, errors };
}

describe('HtmlAudioEngine', () => {
  it('resolves the stream at the chosen quality and sets the source', async () => {
    const { audio, streams, engine } = make(async (id) => info(`https://s/${id}`));
    const states: string[] = [];
    engine.on('state', (s) => states.push(s));
    await engine.load(t('a'));
    expect(streams.resolve).toHaveBeenCalledWith('a', 'medium');
    expect(audio.src).toBe('https://s/a');
    expect(states).toEqual(['loading']);
  });

  it('keeps the newest track when an older load finishes late', async () => {
    let releaseA = (_: StreamInfo) => {};
    const { audio, engine } = make((id) =>
      id === 'a'
        ? new Promise<StreamInfo>((r) => {
            releaseA = r;
          })
        : Promise.resolve(info('https://s/b')),
    );
    const slow = engine.load(t('a'));
    await engine.load(t('b'));
    releaseA(info('https://s/a'));
    await slow;
    expect(audio.src).toBe('https://s/b');
  });

  it('re-resolves once at the same position after a media error, then reports the next one', async () => {
    let n = 0;
    const { audio, streams, engine, errors } = make(async () => info(`https://s/${++n}`));
    await engine.load(t('a'));
    audio.currentTime = 42;
    audio.dispatchEvent(new Event('error'));
    await flush();
    expect(streams.resolve).toHaveBeenCalledTimes(2);
    expect(audio.src).toBe('https://s/2');
    expect(audio.currentTime).toBe(42);
    expect(audio.play).toHaveBeenCalled();
    expect(errors).toEqual([]);

    audio.dispatchEvent(new Event('error'));
    await flush();
    expect(errors).toHaveLength(1);
  });

  it('gets a fresh URL before resuming an expired stream', async () => {
    let n = 0;
    const { audio, streams, engine } = make(async () =>
      info(`https://s/${++n}`, n === 1 ? Date.now() - 1 : Date.now() + 3_600_000),
    );
    await engine.load(t('a'));
    audio.currentTime = 90;
    engine.play();
    await flush();
    expect(streams.resolve).toHaveBeenCalledTimes(2);
    expect(audio.src).toBe('https://s/2');
    expect(audio.currentTime).toBe(90);
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it('ignores AbortError from play() when a new load interrupts it', async () => {
    const { audio, engine, errors } = make(async () => info('https://s/a'));
    audio.play = vi.fn(async () => {
      throw new DOMException('interrupted', 'AbortError');
    });
    await engine.load(t('a'));
    engine.play();
    await flush();
    expect(errors).toEqual([]);
  });

  it('maps media events', async () => {
    const { audio, engine } = make(async () => info('https://s/a'));
    const times: { position: number; duration: number }[] = [];
    const ended = vi.fn();
    engine.on('time', (x) => times.push(x));
    engine.on('ended', ended);
    audio.currentTime = 3;
    audio.dispatchEvent(new Event('timeupdate'));
    audio.dispatchEvent(new Event('ended'));
    expect(times).toEqual([{ position: 3, duration: 0 }]);
    expect(ended).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @breeze/desktop test html-audio`
Expected: FAIL, cannot resolve `../src/renderer/src/html-audio-engine`.

- [ ] **Step 3: Implement**

Create `apps/desktop/src/renderer/src/html-audio-engine.ts`:

```ts
import type { AudioQuality, Track } from '@breeze/core';
import type { StreamInfo } from '@breeze/core/stream';
import { type AudioEngine, Emitter, type EngineEvents } from '@breeze/ui/player';

export interface StreamSource {
  resolve(id: string, quality: AudioQuality): Promise<StreamInfo>;
}

/** Re-resolve this long before the URL's stated expiry. */
const EXPIRY_MARGIN_MS = 60_000;

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

/** Plays resolved YouTube audio streams through an <audio> element. */
export class HtmlAudioEngine implements AudioEngine {
  private readonly events = new Emitter<EngineEvents>();
  private track: Track | null = null;
  private stream: StreamInfo | null = null;
  private retried = false;

  constructor(
    private readonly streams: StreamSource,
    private readonly quality: () => AudioQuality,
    private readonly audio: HTMLAudioElement = new Audio(),
  ) {
    audio.preload = 'auto';
    audio.addEventListener('timeupdate', () =>
      this.events.emit('time', {
        position: audio.currentTime,
        duration: Number.isFinite(audio.duration) ? audio.duration : 0,
      }),
    );
    audio.addEventListener('playing', () => {
      this.retried = false;
      this.events.emit('state', 'playing');
    });
    audio.addEventListener('pause', () => this.events.emit('state', 'paused'));
    audio.addEventListener('waiting', () => this.events.emit('state', 'loading'));
    audio.addEventListener('ended', () => this.events.emit('ended', undefined));
    audio.addEventListener('error', () => void this.recover());
  }

  async load(track: Track): Promise<void> {
    this.track = track;
    this.retried = false;
    this.events.emit('state', 'loading');
    await this.setSource(track, 0);
  }

  play(): void {
    if (this.track && this.stream && Date.now() > this.stream.expiresAt - EXPIRY_MARGIN_MS) {
      void this.reload(this.audio.currentTime); // expired while paused
      return;
    }
    this.audio.play().catch((e: unknown) => {
      if (!isAbort(e)) this.events.emit('error', e);
    });
  }

  pause(): void {
    this.audio.pause();
  }

  seek(seconds: number): void {
    this.audio.currentTime = seconds;
  }

  setVolume(v: number): void {
    this.audio.volume = v;
  }

  on<K extends keyof EngineEvents>(event: K, cb: (payload: EngineEvents[K]) => void): () => void {
    return this.events.on(event, cb);
  }

  private async setSource(track: Track, at: number): Promise<void> {
    const stream = await this.streams.resolve(track.id, this.quality());
    if (this.track !== track) return; // a newer load won
    this.stream = stream;
    this.audio.src = stream.url;
    if (at > 0) this.audio.currentTime = at;
  }

  private async reload(at: number): Promise<void> {
    const track = this.track;
    if (!track) return;
    try {
      await this.setSource(track, at);
      if (this.track === track) await this.audio.play();
    } catch (e) {
      if (this.track === track && !isAbort(e)) this.events.emit('error', e);
    }
  }

  /** Stream URLs expire or get 403'd: get a fresh one once, at the same position, before giving up. */
  private async recover(): Promise<void> {
    if (!this.track) return;
    if (this.retried) {
      this.events.emit('error', this.audio.error ?? new Error('Playback failed'));
      return;
    }
    this.retried = true;
    await this.reload(this.audio.currentTime);
  }
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @breeze/desktop test` then `pnpm typecheck`
Expected: all PASS; typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop
git commit -m "feat(desktop): audio engine that re-resolves expired streams" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Wire the app, run it, CI

**Files:**
- Create: `apps/desktop/electron.vite.config.ts`, `apps/desktop/src/main/index.ts`, `apps/desktop/src/preload/index.ts`
- Create: `apps/desktop/src/renderer/index.html`, `apps/desktop/src/renderer/src/main.tsx`, `apps/desktop/src/renderer/src/env.d.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `registerIpc` (Task 7), `createServices` (Task 7), `JsonFileStorage` (Task 6), `ipcSource`, `ipcStorage`, `ipcStreams` (Task 7), `HtmlAudioEngine` (Task 8), `App`, `PlayerController` (`@breeze/ui`), `DEFAULT_SETTINGS` (`@breeze/core`).
- Produces: a runnable app via `pnpm dev:desktop`, plus a production build in `apps/desktop/out/`.

- [ ] **Step 1: electron-vite config**

Create `apps/desktop/electron.vite.config.ts`:

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

export default defineConfig({
  main: {},
  // The sandboxed preload must be CommonJS; .cjs because this package is "type": "module".
  preload: {
    build: { rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } } },
  },
  renderer: {
    plugins: [react()],
    resolve: { dedupe: ['react', 'react-dom'] },
  },
});
```

- [ ] **Step 2: Main process**

Create `apps/desktop/src/main/index.ts`:

```ts
import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { registerIpc } from './ipc';
import { createServices } from './services';
import { JsonFileStorage } from './storage';

let win: BrowserWindow | null = null;

function createWindow(): void {
  win = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 880,
    minHeight: 600,
    show: false,
    title: 'Breeze',
    backgroundColor: '#0e1116',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.once('ready-to-show', () => win?.show());
  // Never open other windows in-app; https links go to the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) void win.loadURL(devUrl);
  else void win.loadFile(join(import.meta.dirname, '../renderer/index.html'));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(() => {
    registerIpc(ipcMain, createServices(new JsonFileStorage(app.getPath('userData'))));
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
```

- [ ] **Step 3: Preload**

Create `apps/desktop/src/preload/index.ts`:

```ts
import { contextBridge, ipcRenderer } from 'electron';
import { type BreezeApi, channel, METHOD_NAMES } from '../shared/ipc';

// Only named Breeze calls cross the bridge; the renderer never sees ipcRenderer itself.
const api = Object.fromEntries(
  METHOD_NAMES.map((name) => [name, (...args: unknown[]) => ipcRenderer.invoke(channel(name), ...args)]),
) as BreezeApi;

contextBridge.exposeInMainWorld('breeze', api);
```

- [ ] **Step 4: Renderer**

Create `apps/desktop/src/renderer/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.ytimg.com https://*.googleusercontent.com https://*.ggpht.com; media-src 'self' https://*.googlevideo.com"
    />
    <title>Breeze</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./src/main.tsx"></script>
  </body>
</html>
```

Create `apps/desktop/src/renderer/src/env.d.ts`:

```ts
import type { BreezeApi } from '../../shared/ipc';

declare global {
  interface Window {
    breeze: BreezeApi;
  }
}
```

Create `apps/desktop/src/renderer/src/main.tsx`:

```tsx
import '@breeze/ui/styles.css';
import { DEFAULT_SETTINGS } from '@breeze/core';
import { App, PlayerController } from '@breeze/ui';
import { createRoot } from 'react-dom/client';
import { HtmlAudioEngine } from './html-audio-engine';
import { ipcSource, ipcStorage, ipcStreams } from './ipc-adapters';

const api = window.breeze;
const source = ipcSource(api);
const storage = ipcStorage(api);
const settings = await storage.getSettings().catch(() => DEFAULT_SETTINGS);

const engine = new HtmlAudioEngine(ipcStreams(api), () => settings.audioQuality);
const player = new PlayerController({ engine, source, storage, autoplay: () => settings.autoplay }, settings.volume);

createRoot(document.getElementById('root') as HTMLElement).render(
  <App player={player} services={{ source, storage }} />,
);
```

- [ ] **Step 5: Typecheck, lint, build**

Run: `pnpm typecheck`, then `pnpm lint:fix` and `pnpm lint`, then `pnpm --filter @breeze/desktop build`.
Expected:
- Typecheck and lint pass.
- The build writes `apps/desktop/out/main/index.js`, `apps/desktop/out/preload/index.cjs` and `apps/desktop/out/renderer/index.html`.

Then run: `Get-Content apps/desktop/out/preload/index.cjs -TotalCount 5`
Expected: CommonJS (`require("electron")` or `"use strict"`), not `import`.

If electron-vite ignored the rollup output override, replace the `preload` block with `preload: { build: { lib: { formats: ['cjs'] }, rollupOptions: { output: { entryFileNames: '[name].cjs' } } } }` and rebuild.

Also check that `out/main/index.js` imports `youtubei.js` rather than inlining it: `Select-String -Path apps/desktop/out/main/index.js -Pattern 'from "youtubei.js"'` must match.

- [ ] **Step 6: Run it and check the slice by hand**

Run: `pnpm dev:desktop`
Check each item; every one must hold:
1. A "Breeze" window opens with the sidebar (Home, Search) and an empty player bar that reads "Nothing playing".
2. Home shows skeleton rows, then at least one titled shelf of songs.
3. Search: type `daft punk`. Results appear; the rows show artwork, title, artist and duration, with no `undefined` and no broken images.
4. Click a song. Audio starts within about 3 s. The player bar shows the track and the seek bar moves.
5. Pause and Play work; Next and Previous work; drag the seek bar and playback jumps.
6. Press the keyboard media Play/Pause key. Playback toggles, and the Windows media overlay shows the title and artwork.
7. Turn Wi-Fi off and click a song. A toast says "Can't reach YouTube Music…", and after 3 tracks playback stops. Turn Wi-Fi back on.
8. Close the window and run `pnpm dev:desktop` again. `%APPDATA%\Breeze\library.json` exists and contains the played tracks under `history`.
9. Start a second copy while the first is open. No second window appears; the first is focused.

Then run the production build: `pnpm --filter @breeze/desktop start`. Repeat checks 1, 3 and 4.

Any failure: debug with superpowers:systematic-debugging, then add a unit test for the cause where one is possible, before fixing.

- [ ] **Step 7: CI**

Modify `.github/workflows/ci.yml`. Add a job-level `env` under `check:` (at the same indent as `runs-on`), so CI does not download the Electron binary:

```yaml
env:
  ELECTRON_SKIP_BINARY_DOWNLOAD: "1"
```

Run: `pnpm lint` (it also formats YAML), then `pnpm test`.
Expected: lint clean; every package's tests pass.

- [ ] **Step 8: Commit and push**

```bash
git add apps/desktop .github/workflows/ci.yml package.json pnpm-lock.yaml
git commit -m "feat(desktop): wire Electron main, preload and renderer into a playable app" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

Expected: the push succeeds; the GitHub Actions CI run for this commit is green.
