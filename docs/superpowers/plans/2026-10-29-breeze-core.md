# Breeze Core Implementation Plan (Plan 1 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the pnpm monorepo and ship `@breeze/core`: shared types, typed errors, queue logic, synced lyrics, storage contract, and a YouTube Music `MusicSource` backed by `youtubei.js`, all unit-tested and pushed to GitHub with CI.

**Architecture:** `packages/core` is plain TypeScript with no UI. Its main entry (`@breeze/core`) is browser-safe; the `youtubei.js` implementation lives behind a separate entry (`@breeze/core/innertube`) so only Electron main and Vercel functions import it. `InnerTubeSource` takes a structural `MusicClient` so tests inject fakes and never touch the network.

**Tech Stack:** pnpm workspaces, TypeScript (strict), Vitest, tsx, Biome, `youtubei.js`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-29-breeze-music-design.md`

**Plan series:**
1. This plan: monorepo + `packages/core`.
2. `packages/ui` + `apps/desktop` (Electron, stream resolving, JSON storage, media keys, tray).
3. `apps/web` (landing page, `/app` web player, Vercel functions, IFrame engine, IndexedDB storage).
4. Release pipeline (electron-builder NSIS, GitHub Releases, electron-updater, Vercel project setup).

## Global Constraints

- Node 22+ for development.
- pnpm workspace; packages live in `packages/*`, apps in `apps/*`.
- TypeScript strict mode.
- All YouTube access goes through the `MusicSource` interface; `youtubei.js` is imported only from `packages/core/src/innertube.ts`.
- `MusicSource` errors surface as `SourceError { kind: 'network' | 'blocked' | 'not_found' | 'parse' }`.
- No live network in CI tests; use fixtures/fakes.
- History keeps the last 500 items.
- Settings: theme `light | dark | system`, audio quality, autoplay on/off.
- Repo: `https://github.com/mrtheo-hub/Breeze-Music-Main`, branch `main`.
- CI on every push: typecheck, lint, unit tests.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Tracks with missing metadata** (music videos with no album, no duration, no thumbnails, title as a youtubei.js `Text` object): mapping must still yield a valid `Track`, not crash. Pinned in Task 4.
2. **Blank search query** (`''`, `'   '`): returns an empty `SearchResult` without calling YouTube. Pinned in Task 5.
3. **Queue edits around the playing track** (remove the current track, remove the last track, drag the current track): the same song keeps playing or the next one is selected; the index never points past the end. Pinned in Task 2.
4. **Real-world LRC files** (2-digit and 1-digit fractions, several timestamps on one line, `[offset:]`, CRLF line endings, metadata tags): times must be correct and sorted. Pinned in Task 3.
5. **YouTube failures** (rate limit, "not found", network down, unexpected shape): callers always get a `SourceError` with the right `kind`, never a raw error. Pinned in Tasks 1 and 5.

---

## File map

```
D:\Breeze Music\
├─ .gitignore
├─ .github\workflows\ci.yml          Task 7
├─ biome.json                         Task 7
├─ package.json                       Task 1 (root scripts)
├─ pnpm-workspace.yaml                Task 1
├─ tsconfig.base.json                 Task 1
└─ packages\core\
   ├─ package.json                    Task 1
   ├─ tsconfig.json                   Task 1
   ├─ src\index.ts                    Task 1, extended in Tasks 2, 3, 6
   ├─ src\types.ts                    Task 1  domain types
   ├─ src\errors.ts                   Task 1  SourceError, toSourceError
   ├─ src\source.ts                   Task 1  MusicSource interface
   ├─ src\queue.ts                    Task 2  pure queue functions
   ├─ src\lrc.ts                      Task 3  parseLrc, lineAt
   ├─ src\lyrics.ts                   Task 3  LRCLIB client
   ├─ src\mappers.ts                  Task 4  youtubei.js node -> domain types
   ├─ src\innertube.ts                Task 5  InnerTubeSource
   ├─ src\storage.ts                  Task 6  Storage interface, MemoryStorage
   ├─ scripts\smoke.ts                Task 5  live check against YouTube (manual)
   └─ test\*.test.ts                  one per src module
```

---

### Task 1: Workspace scaffold, domain types, errors

**Files:**
- Create: `.gitignore`, `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`
- Create: `packages/core/src/types.ts`, `packages/core/src/errors.ts`, `packages/core/src/source.ts`, `packages/core/src/index.ts`
- Test: `packages/core/test/errors.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: all domain types in `types.ts` (`Track`, `Thumbnail`, `ArtistRef`, `AlbumRef`, `AlbumSummary`, `ArtistSummary`, `PlaylistSummary`, `Album`, `Artist`, `Playlist`, `SearchResult`, `HomeItem`, `HomeSection`, `LyricsLine`, `Lyrics`, `LocalPlaylist`, `Settings`, `Theme`, `AudioQuality`); `SourceError`, `SourceErrorKind`, `toSourceError(e: unknown): SourceError`; `MusicSource`, `SearchFilter`.

- [ ] **Step 1: Check toolchain**

Run: `node --version` and `pnpm --version`
Expected: Node `v22.x` or newer. If `pnpm` is missing, run `corepack enable pnpm`, then re-check.

- [ ] **Step 2: Init git and root files**

Run (from `D:\Breeze Music`): `git init -b main`

Create `.gitignore`:

```gitignore
node_modules/
dist/
out/
release/
.vercel/
*.log
.env
.env.*
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

Create `package.json`:

```json
{
  "name": "breeze-music",
  "private": true,
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck"
  }
}
```

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noEmit": true
  }
}
```

- [ ] **Step 3: Create the core package**

Create `packages/core/package.json`:

```json
{
  "name": "@breeze/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./innertube": "./src/innertube.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p .",
    "smoke": "tsx scripts/smoke.ts"
  }
}
```

Create `packages/core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test", "scripts"]
}
```

Run: `pnpm --filter @breeze/core add -D typescript vitest tsx @types/node`
Expected: install succeeds, `packages/core/node_modules` exists, `pnpm-lock.yaml` created at root.

- [ ] **Step 4: Write domain types**

Create `packages/core/src/types.ts`:

```ts
export interface Thumbnail {
  url: string;
  width: number;
  height: number;
}

export interface ArtistRef {
  id?: string;
  name: string;
}

export interface AlbumRef {
  id?: string;
  name: string;
}

export interface Track {
  id: string;
  title: string;
  artists: ArtistRef[];
  album?: AlbumRef;
  durationSec?: number;
  thumbnails: Thumbnail[];
}

export interface AlbumSummary {
  id: string;
  title: string;
  year?: string;
  thumbnails: Thumbnail[];
}

export interface ArtistSummary {
  id: string;
  name: string;
  thumbnails: Thumbnail[];
}

export interface PlaylistSummary {
  id: string;
  title: string;
  author?: string;
  thumbnails: Thumbnail[];
}

export interface Album extends AlbumSummary {
  artists: ArtistRef[];
  tracks: Track[];
}

export interface Artist extends ArtistSummary {
  topTracks: Track[];
  albums: AlbumSummary[];
}

export interface Playlist extends PlaylistSummary {
  tracks: Track[];
}

export interface SearchResult {
  songs: Track[];
  albums: AlbumSummary[];
  artists: ArtistSummary[];
  playlists: PlaylistSummary[];
}

export type HomeItem =
  | { kind: 'track'; track: Track }
  | { kind: 'album'; album: AlbumSummary }
  | { kind: 'artist'; artist: ArtistSummary }
  | { kind: 'playlist'; playlist: PlaylistSummary };

export interface HomeSection {
  title: string;
  items: HomeItem[];
}

export interface LyricsLine {
  timeMs: number;
  text: string;
}

export interface Lyrics {
  synced: LyricsLine[] | null;
  plain: string | null;
}

export interface LocalPlaylist {
  id: string;
  name: string;
  tracks: Track[];
  createdAt: number;
  updatedAt: number;
}

export type Theme = 'light' | 'dark' | 'system';
export type AudioQuality = 'low' | 'medium' | 'high';

export interface Settings {
  theme: Theme;
  audioQuality: AudioQuality;
  autoplay: boolean;
  volume: number;
}
```

- [ ] **Step 5: Write the MusicSource interface**

Create `packages/core/src/source.ts`:

```ts
import type { Album, Artist, HomeSection, Playlist, SearchResult, Track } from './types';

export type SearchFilter = 'songs' | 'albums' | 'artists' | 'playlists';

/** Every way Breeze reads music data. Implementations must throw only SourceError. */
export interface MusicSource {
  home(): Promise<HomeSection[]>;
  search(query: string, filter?: SearchFilter): Promise<SearchResult>;
  track(id: string): Promise<Track>;
  album(id: string): Promise<Album>;
  artist(id: string): Promise<Artist>;
  playlist(id: string): Promise<Playlist>;
  /** Radio / autoplay continuation for a track. Never includes the seed track. */
  upNext(trackId: string): Promise<Track[]>;
}
```

- [ ] **Step 6: Write the failing errors test**

Create `packages/core/test/errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SourceError, toSourceError } from '../src/errors';

describe('toSourceError', () => {
  it('passes a SourceError through unchanged', () => {
    const e = new SourceError('blocked', 'nope');
    expect(toSourceError(e)).toBe(e);
  });

  it.each([
    ['Video not found', 'not_found'],
    ['Request failed with status 404', 'not_found'],
    ['fetch failed', 'network'],
    ['getaddrinfo ENOTFOUND music.youtube.com', 'network'],
    ['Request failed with status 429', 'blocked'],
    ['Sign in to confirm you are not a bot', 'blocked'],
    ["Cannot read properties of undefined (reading 'contents')", 'parse'],
  ] as const)('maps "%s" to %s', (message, kind) => {
    const out = toSourceError(new Error(message));
    expect(out).toBeInstanceOf(SourceError);
    expect(out.kind).toBe(kind);
    expect(out.message).toBe(message);
  });

  it('handles non-Error throws', () => {
    const out = toSourceError('boom');
    expect(out.kind).toBe('parse');
    expect(out.message).toBe('boom');
  });

  it('keeps the original error as cause', () => {
    const original = new Error('fetch failed');
    expect(toSourceError(original).cause).toBe(original);
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `pnpm --filter @breeze/core test`
Expected: FAIL, cannot resolve `../src/errors`.

- [ ] **Step 8: Implement errors**

Create `packages/core/src/errors.ts`:

```ts
export type SourceErrorKind = 'network' | 'blocked' | 'not_found' | 'parse';

export class SourceError extends Error {
  constructor(
    readonly kind: SourceErrorKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'SourceError';
  }
}

const NOT_FOUND = /not found|404|does not exist|unavailable/i;
const NETWORK = /fetch failed|ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|network/i;
const BLOCKED = /429|403|captcha|sign in|bot/i;

/** Normalise anything thrown by youtubei.js or fetch into a SourceError. */
export function toSourceError(e: unknown): SourceError {
  if (e instanceof SourceError) return e;
  const message = e instanceof Error ? e.message : String(e);
  const kind = NOT_FOUND.test(message)
    ? 'not_found'
    : NETWORK.test(message)
      ? 'network'
      : BLOCKED.test(message)
        ? 'blocked'
        : 'parse';
  return new SourceError(kind, message, { cause: e });
}
```

Create `packages/core/src/index.ts`:

```ts
export * from './types';
export * from './errors';
export type { MusicSource, SearchFilter } from './source';
```

- [ ] **Step 9: Run tests and typecheck**

Run: `pnpm --filter @breeze/core test` then `pnpm typecheck`
Expected: all errors tests PASS; typecheck exits 0.

- [ ] **Step 10: Commit**

```bash
git add .gitignore package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json packages/core docs
git commit -m "feat(core): scaffold monorepo, domain types and SourceError" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Queue logic

**Files:**
- Create: `packages/core/src/queue.ts`
- Modify: `packages/core/src/index.ts` (add export)
- Test: `packages/core/test/queue.test.ts`

**Interfaces:**
- Consumes: `Track` from `types.ts`.
- Produces (all pure, never mutate input):
  - `type RepeatMode = 'off' | 'all' | 'one'`
  - `interface QueueState { tracks: Track[]; index: number; repeat: RepeatMode; shuffled: boolean; original: Track[] }`
  - `emptyQueue(): QueueState`
  - `current(s): Track | null`
  - `setQueue(s, tracks: Track[], startIndex?: number, random?: () => number): QueueState`
  - `enqueue(s, tracks: Track[]): QueueState`
  - `playNext(s, tracks: Track[]): QueueState`
  - `removeAt(s, i: number): QueueState`
  - `move(s, from: number, to: number): QueueState`
  - `clear(s): QueueState`
  - `next(s, auto?: boolean): { state: QueueState; ended: boolean }`
  - `prev(s): QueueState`
  - `toggleShuffle(s, random?: () => number): QueueState`
  - `setRepeat(s, mode: RepeatMode): QueueState`

`index` is `-1` when the queue is empty. `original` holds the unshuffled order; when `shuffled` is false it mirrors `tracks`. `next(s, true)` means "the track ended by itself". Repeat-one only replays on auto. `ended: true` tells the player to stop or fetch `upNext`.

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/queue.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  clear,
  current,
  emptyQueue,
  enqueue,
  move,
  next,
  playNext,
  prev,
  removeAt,
  setQueue,
  setRepeat,
  toggleShuffle,
} from '../src/queue';
import type { Track } from '../src/types';

const t = (id: string): Track => ({ id, title: id, artists: [], thumbnails: [] });
const ids = (tracks: Track[]) => tracks.map((x) => x.id);
const abcde = () => setQueue(emptyQueue(), ['a', 'b', 'c', 'd', 'e'].map(t), 1);

describe('setQueue / current', () => {
  it('starts empty', () => {
    expect(emptyQueue().index).toBe(-1);
    expect(current(emptyQueue())).toBeNull();
  });

  it('clamps the start index', () => {
    expect(setQueue(emptyQueue(), [t('a'), t('b')], 9).index).toBe(1);
    expect(setQueue(emptyQueue(), [t('a'), t('b')], -3).index).toBe(0);
  });

  it('empty list gives index -1', () => {
    expect(setQueue(abcde(), []).index).toBe(-1);
  });

  it('does not mutate the input array', () => {
    const list = [t('a'), t('b')];
    setQueue(emptyQueue(), list).tracks.push(t('z'));
    expect(ids(list)).toEqual(['a', 'b']);
  });
});

describe('next / prev', () => {
  it('advances', () => {
    const r = next(abcde());
    expect(current(r.state)?.id).toBe('c');
    expect(r.ended).toBe(false);
  });

  it('ends at the last track with repeat off', () => {
    const last = setQueue(emptyQueue(), [t('a'), t('b')], 1);
    const r = next(last);
    expect(r.ended).toBe(true);
    expect(r.state.index).toBe(1);
  });

  it('wraps with repeat all', () => {
    const last = setRepeat(setQueue(emptyQueue(), [t('a'), t('b')], 1), 'all');
    expect(current(next(last).state)?.id).toBe('a');
  });

  it('repeat one replays on auto but skips on manual next', () => {
    const s = setRepeat(abcde(), 'one');
    expect(current(next(s, true).state)?.id).toBe('b');
    expect(current(next(s, false).state)?.id).toBe('c');
  });

  it('empty queue reports ended', () => {
    expect(next(emptyQueue()).ended).toBe(true);
  });

  it('prev stays at the start with repeat off and wraps with repeat all', () => {
    const first = setQueue(emptyQueue(), [t('a'), t('b')], 0);
    expect(prev(first).index).toBe(0);
    expect(prev(setRepeat(first, 'all')).index).toBe(1);
    expect(prev(abcde()).index).toBe(0);
  });
});

describe('editing', () => {
  it('enqueue into an empty queue selects the first track', () => {
    const s = enqueue(emptyQueue(), [t('a'), t('b')]);
    expect(s.index).toBe(0);
    expect(ids(s.tracks)).toEqual(['a', 'b']);
  });

  it('playNext inserts right after the current track', () => {
    const s = playNext(abcde(), [t('x'), t('y')]);
    expect(ids(s.tracks)).toEqual(['a', 'b', 'x', 'y', 'c', 'd', 'e']);
    expect(current(s)?.id).toBe('b');
  });

  it('removing before the current track keeps the same song playing', () => {
    const s = removeAt(abcde(), 0);
    expect(current(s)?.id).toBe('b');
  });

  it('removing after the current track keeps the index', () => {
    expect(removeAt(abcde(), 3).index).toBe(1);
  });

  it('removing the current track selects the next one', () => {
    expect(current(removeAt(abcde(), 1))?.id).toBe('c');
  });

  it('removing the current track when it is last selects the new last', () => {
    const s = setQueue(emptyQueue(), [t('a'), t('b')], 1);
    const r = removeAt(s, 1);
    expect(r.index).toBe(0);
    expect(current(r)?.id).toBe('a');
  });

  it('removing the only track empties the queue', () => {
    expect(removeAt(setQueue(emptyQueue(), [t('a')]), 0).index).toBe(-1);
  });

  it('out-of-range remove is a no-op', () => {
    const s = abcde();
    expect(removeAt(s, 99)).toBe(s);
  });

  it('moving the current track follows it', () => {
    const s = move(abcde(), 1, 4);
    expect(ids(s.tracks)).toEqual(['a', 'c', 'd', 'e', 'b']);
    expect(current(s)?.id).toBe('b');
  });

  it('moving a track across the current one keeps the same song playing', () => {
    expect(current(move(abcde(), 0, 3))?.id).toBe('b');
    expect(current(move(abcde(), 4, 0))?.id).toBe('b');
  });

  it('clear empties everything', () => {
    const s = clear(abcde());
    expect(s.tracks).toEqual([]);
    expect(s.index).toBe(-1);
  });
});

describe('shuffle', () => {
  it('keeps played tracks in place and shuffles the rest', () => {
    const s = toggleShuffle(abcde(), () => 0);
    expect(s.shuffled).toBe(true);
    expect(ids(s.tracks)).toEqual(['a', 'b', 'd', 'e', 'c']);
    expect(current(s)?.id).toBe('b');
  });

  it('unshuffle restores the original order and keeps the current track', () => {
    const shuffled = next(toggleShuffle(abcde(), () => 0)).state; // now on 'd'
    const s = toggleShuffle(shuffled);
    expect(s.shuffled).toBe(false);
    expect(ids(s.tracks)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(current(s)?.id).toBe('d');
  });

  it('tracks added while shuffled survive unshuffle', () => {
    const s = toggleShuffle(enqueue(toggleShuffle(abcde(), () => 0), [t('z')]));
    expect(ids(s.tracks)).toEqual(['a', 'b', 'c', 'd', 'e', 'z']);
  });

  it('tracks removed while shuffled stay removed after unshuffle', () => {
    const shuffled = toggleShuffle(abcde(), () => 0); // a b d e c
    const s = toggleShuffle(removeAt(shuffled, 4)); // remove c
    expect(ids(s.tracks)).toEqual(['a', 'b', 'd', 'e']);
  });

  it('setQueue while shuffled keeps shuffle on', () => {
    const s = setQueue(toggleShuffle(emptyQueue()), ['a', 'b', 'c'].map(t), 0, () => 0);
    expect(s.shuffled).toBe(true);
    expect(current(s)?.id).toBe('a');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @breeze/core test queue`
Expected: FAIL, cannot resolve `../src/queue`.

- [ ] **Step 3: Implement the queue**

Create `packages/core/src/queue.ts`:

```ts
import type { Track } from './types';

export type RepeatMode = 'off' | 'all' | 'one';

export interface QueueState {
  tracks: Track[];
  /** -1 when the queue is empty. */
  index: number;
  repeat: RepeatMode;
  shuffled: boolean;
  /** Unshuffled order. Mirrors `tracks` while `shuffled` is false. */
  original: Track[];
}

export function emptyQueue(): QueueState {
  return { tracks: [], index: -1, repeat: 'off', shuffled: false, original: [] };
}

export function current(s: QueueState): Track | null {
  return s.tracks[s.index] ?? null;
}

function withTracks(s: QueueState, tracks: Track[], index: number, original: Track[]): QueueState {
  return { ...s, tracks, index, original: s.shuffled ? original : tracks };
}

export function setQueue(s: QueueState, tracks: Track[], startIndex = 0, random = Math.random): QueueState {
  const list = [...tracks];
  const index = list.length === 0 ? -1 : Math.min(Math.max(startIndex, 0), list.length - 1);
  const base: QueueState = { ...s, tracks: list, original: list, index, shuffled: false };
  return s.shuffled ? toggleShuffle(base, random) : base;
}

export function enqueue(s: QueueState, tracks: Track[]): QueueState {
  const list = [...s.tracks, ...tracks];
  const index = s.index === -1 && list.length > 0 ? 0 : s.index;
  return withTracks(s, list, index, [...s.original, ...tracks]);
}

export function playNext(s: QueueState, tracks: Track[]): QueueState {
  const list = [...s.tracks];
  list.splice(s.index + 1, 0, ...tracks);
  const cur = current(s);
  const original = [...s.original];
  const at = cur ? original.indexOf(cur) + 1 : original.length;
  original.splice(at, 0, ...tracks);
  const index = s.index === -1 && list.length > 0 ? 0 : s.index;
  return withTracks(s, list, index, original);
}

export function removeAt(s: QueueState, i: number): QueueState {
  if (i < 0 || i >= s.tracks.length) return s;
  const removed = s.tracks[i];
  const list = s.tracks.filter((_, j) => j !== i);
  const original = [...s.original];
  const oi = original.indexOf(removed as Track);
  if (oi !== -1) original.splice(oi, 1);
  let index: number;
  if (list.length === 0) index = -1;
  else if (i < s.index) index = s.index - 1;
  else if (i === s.index) index = Math.min(s.index, list.length - 1);
  else index = s.index;
  return withTracks(s, list, index, original);
}

export function move(s: QueueState, from: number, to: number): QueueState {
  const n = s.tracks.length;
  if (from < 0 || from >= n || to < 0 || to >= n || from === to) return s;
  const list = [...s.tracks];
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item as Track);
  let index = s.index;
  if (from === s.index) index = to;
  else if (from < s.index && to >= s.index) index = s.index - 1;
  else if (from > s.index && to <= s.index) index = s.index + 1;
  return withTracks(s, list, index, s.original);
}

export function clear(s: QueueState): QueueState {
  return { ...s, tracks: [], original: [], index: -1 };
}

export function next(s: QueueState, auto = false): { state: QueueState; ended: boolean } {
  if (s.index === -1) return { state: s, ended: true };
  if (auto && s.repeat === 'one') return { state: s, ended: false };
  if (s.index + 1 < s.tracks.length) return { state: { ...s, index: s.index + 1 }, ended: false };
  if (s.repeat === 'all') return { state: { ...s, index: 0 }, ended: false };
  return { state: s, ended: true };
}

export function prev(s: QueueState): QueueState {
  if (s.index > 0) return { ...s, index: s.index - 1 };
  if (s.repeat === 'all' && s.tracks.length > 0) return { ...s, index: s.tracks.length - 1 };
  return s;
}

export function toggleShuffle(s: QueueState, random = Math.random): QueueState {
  if (!s.shuffled) {
    const played = s.tracks.slice(0, s.index + 1);
    const rest = s.tracks.slice(s.index + 1);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [rest[i], rest[j]] = [rest[j] as Track, rest[i] as Track];
    }
    return { ...s, tracks: [...played, ...rest], original: s.tracks, shuffled: true };
  }
  const cur = current(s);
  const list = [...s.original];
  const found = cur ? list.indexOf(cur) : -1;
  const index = list.length === 0 ? -1 : found !== -1 ? found : Math.min(Math.max(s.index, 0), list.length - 1);
  return { ...s, tracks: list, original: list, index, shuffled: false };
}

export function setRepeat(s: QueueState, mode: RepeatMode): QueueState {
  return { ...s, repeat: mode };
}
```

Add to `packages/core/src/index.ts`:

```ts
export * from './queue';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @breeze/core test queue` then `pnpm typecheck`
Expected: all queue tests PASS; typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/queue.ts packages/core/src/index.ts packages/core/test/queue.test.ts
git commit -m "feat(core): add pure queue logic with shuffle and repeat" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Synced lyrics (LRC parser + LRCLIB client)

**Files:**
- Create: `packages/core/src/lrc.ts`, `packages/core/src/lyrics.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/lrc.test.ts`, `packages/core/test/lyrics.test.ts`

**Interfaces:**
- Consumes: `LyricsLine`, `Lyrics` from `types.ts`; `SourceError` from `errors.ts`.
- Produces:
  - `parseLrc(text: string): LyricsLine[]` (sorted by `timeMs`)
  - `lineAt(lines: LyricsLine[], ms: number): number`: index of the active line, `-1` before the first
  - `type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>`
  - `interface LyricsQuery { title: string; artist: string; album?: string; durationSec?: number }`
  - `fetchLyrics(q: LyricsQuery, fetcher?: Fetcher): Promise<Lyrics>`

LRCLIB API: `GET https://lrclib.net/api/get?track_name&artist_name&album_name&duration` returns one record or 404. `GET https://lrclib.net/api/search?track_name&artist_name` returns an array. Records have `syncedLyrics`, `plainLyrics`, `instrumental`.

- [ ] **Step 1: Write the failing parser test**

Create `packages/core/test/lrc.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { lineAt, parseLrc } from '../src/lrc';

describe('parseLrc', () => {
  it('parses 2-digit fractions as centiseconds', () => {
    expect(parseLrc('[00:12.34]Hello')).toEqual([{ timeMs: 12340, text: 'Hello' }]);
  });

  it('parses 1-digit and 3-digit fractions and no fraction', () => {
    expect(parseLrc('[00:01.5]a\n[00:01.123]b\n[01:02]c').map((l) => l.timeMs)).toEqual([1123, 1500, 62000]);
  });

  it('expands several timestamps on one line and sorts', () => {
    expect(parseLrc('[00:05.00]Two\n[00:01.00][00:09.00]Chorus')).toEqual([
      { timeMs: 1000, text: 'Chorus' },
      { timeMs: 5000, text: 'Two' },
      { timeMs: 9000, text: 'Chorus' },
    ]);
  });

  it('ignores metadata tags and untimed lines', () => {
    expect(parseLrc('[ar:Someone]\n[ti:Song]\nplain line\n[00:01.00]x')).toEqual([{ timeMs: 1000, text: 'x' }]);
  });

  it('applies a positive offset by showing lines earlier, never below 0', () => {
    expect(parseLrc('[offset:+500]\n[00:02.00]a\n[00:00.20]b').map((l) => l.timeMs)).toEqual([0, 1500]);
  });

  it('handles CRLF and keeps empty timed lines as gaps', () => {
    expect(parseLrc('[00:01.00]a\r\n[00:02.00]\r\n')).toEqual([
      { timeMs: 1000, text: 'a' },
      { timeMs: 2000, text: '' },
    ]);
  });

  it('returns [] for empty input', () => {
    expect(parseLrc('')).toEqual([]);
  });
});

describe('lineAt', () => {
  const lines = parseLrc('[00:01.00]a\n[00:03.00]b\n[00:05.00]c');

  it('is -1 before the first line', () => {
    expect(lineAt(lines, 500)).toBe(-1);
  });

  it('matches exact times and gaps between lines', () => {
    expect(lineAt(lines, 1000)).toBe(0);
    expect(lineAt(lines, 4999)).toBe(1);
    expect(lineAt(lines, 60_000)).toBe(2);
  });

  it('is -1 for no lines', () => {
    expect(lineAt([], 1000)).toBe(-1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @breeze/core test lrc`
Expected: FAIL, cannot resolve `../src/lrc`.

- [ ] **Step 3: Implement the parser**

Create `packages/core/src/lrc.ts`:

```ts
import type { LyricsLine } from './types';

const STAMP = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const OFFSET = /^\[offset:\s*([+-]?\d+)\s*\]/im;

export function parseLrc(text: string): LyricsLine[] {
  const offset = Number(text.match(OFFSET)?.[1] ?? 0);
  const out: LyricsLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(STAMP)];
    if (stamps.length === 0) continue;
    const line = raw.replace(STAMP, '').trim();
    for (const m of stamps) {
      const ms = Number((m[3] ?? '0').padEnd(3, '0').slice(0, 3));
      const time = (Number(m[1]) * 60 + Number(m[2])) * 1000 + ms - offset;
      out.push({ timeMs: Math.max(0, time), text: line });
    }
  }
  return out.sort((a, b) => a.timeMs - b.timeMs);
}

/** Index of the line active at `ms`, or -1 before the first line. */
export function lineAt(lines: LyricsLine[], ms: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((lines[mid] as LyricsLine).timeMs <= ms) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}
```

- [ ] **Step 4: Run parser tests**

Run: `pnpm --filter @breeze/core test lrc`
Expected: PASS.

- [ ] **Step 5: Write the failing client test**

Create `packages/core/test/lyrics.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SourceError } from '../src/errors';
import { type Fetcher, fetchLyrics } from '../src/lyrics';

type Route = { status: number; body?: unknown };

function fakeFetch(routes: Record<string, Route>) {
  const calls: URL[] = [];
  const fetcher: Fetcher = async (url) => {
    const u = new URL(url);
    calls.push(u);
    const r = routes[u.pathname] ?? { status: 404 };
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  };
  return { fetcher, calls };
}

const query = { title: 'Get Lucky', artist: 'Daft Punk', album: 'Random Access Memories', durationSec: 247.6 };

describe('fetchLyrics', () => {
  it('uses /api/get with rounded duration and parses synced lyrics', async () => {
    const { fetcher, calls } = fakeFetch({
      '/api/get': { status: 200, body: { syncedLyrics: '[00:01.00]Hi', plainLyrics: 'Hi\n' } },
    });
    const out = await fetchLyrics(query, fetcher);
    expect(out).toEqual({ synced: [{ timeMs: 1000, text: 'Hi' }], plain: 'Hi' });
    expect(calls[0]?.pathname).toBe('/api/get');
    expect(calls[0]?.searchParams.get('duration')).toBe('248');
    expect(calls[0]?.searchParams.get('album_name')).toBe('Random Access Memories');
  });

  it('falls back to /api/search on 404 and prefers a synced result', async () => {
    const { fetcher, calls } = fakeFetch({
      '/api/search': {
        status: 200,
        body: [{ plainLyrics: 'plain only' }, { syncedLyrics: '[00:02.00]Yo', plainLyrics: 'Yo' }],
      },
    });
    const out = await fetchLyrics(query, fetcher);
    expect(out.synced).toEqual([{ timeMs: 2000, text: 'Yo' }]);
    expect(calls.map((c) => c.pathname)).toEqual(['/api/get', '/api/search']);
  });

  it('skips /api/get when duration is unknown', async () => {
    const { fetcher, calls } = fakeFetch({ '/api/search': { status: 200, body: [] } });
    await fetchLyrics({ title: 'x', artist: 'y' }, fetcher);
    expect(calls.map((c) => c.pathname)).toEqual(['/api/search']);
  });

  it('returns empty lyrics when nothing is found', async () => {
    const { fetcher } = fakeFetch({ '/api/search': { status: 200, body: [] } });
    expect(await fetchLyrics(query, fetcher)).toEqual({ synced: null, plain: null });
  });

  it('returns empty lyrics for instrumentals', async () => {
    const { fetcher } = fakeFetch({ '/api/get': { status: 200, body: { instrumental: true, plainLyrics: '' } } });
    expect(await fetchLyrics(query, fetcher)).toEqual({ synced: null, plain: null });
  });

  it('throws SourceError network on a 5xx', async () => {
    const { fetcher } = fakeFetch({ '/api/get': { status: 503 } });
    await expect(fetchLyrics(query, fetcher)).rejects.toMatchObject({ kind: 'network' });
  });

  it('throws SourceError network when fetch itself fails', async () => {
    const fetcher: Fetcher = async () => {
      throw new TypeError('fetch failed');
    };
    const err = await fetchLyrics(query, fetcher).catch((e) => e);
    expect(err).toBeInstanceOf(SourceError);
    expect(err.kind).toBe('network');
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @breeze/core test lyrics`
Expected: FAIL, cannot resolve `../src/lyrics`.

- [ ] **Step 7: Implement the client**

Create `packages/core/src/lyrics.ts`:

```ts
import { SourceError } from './errors';
import { parseLrc } from './lrc';
import type { Lyrics } from './types';

export type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface LyricsQuery {
  title: string;
  artist: string;
  album?: string;
  durationSec?: number;
}

interface LrclibRecord {
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
  instrumental?: boolean;
}

const BASE = 'https://lrclib.net/api';
const NONE: Lyrics = { synced: null, plain: null };

export async function fetchLyrics(q: LyricsQuery, fetcher: Fetcher = (url) => fetch(url)): Promise<Lyrics> {
  if (q.durationSec != null) {
    const params = new URLSearchParams({
      track_name: q.title,
      artist_name: q.artist,
      duration: String(Math.round(q.durationSec)),
    });
    if (q.album) params.set('album_name', q.album);
    const record = await getJson<LrclibRecord>(fetcher, `${BASE}/get?${params}`);
    if (record) return toLyrics(record);
  }
  const params = new URLSearchParams({ track_name: q.title, artist_name: q.artist });
  const list = await getJson<LrclibRecord[]>(fetcher, `${BASE}/search?${params}`);
  const best = list?.find((r) => r.syncedLyrics) ?? list?.[0];
  return best ? toLyrics(best) : NONE;
}

async function getJson<T>(fetcher: Fetcher, url: string): Promise<T | null> {
  let res: Awaited<ReturnType<Fetcher>>;
  try {
    res = await fetcher(url);
  } catch (e) {
    throw new SourceError('network', 'Lyrics request failed', { cause: e });
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new SourceError('network', `Lyrics request failed with status ${res.status}`);
  try {
    return (await res.json()) as T;
  } catch (e) {
    throw new SourceError('parse', 'Lyrics response was not JSON', { cause: e });
  }
}

function toLyrics(r: LrclibRecord): Lyrics {
  if (r.instrumental) return NONE;
  const synced = r.syncedLyrics ? parseLrc(r.syncedLyrics) : [];
  return { synced: synced.length > 0 ? synced : null, plain: r.plainLyrics?.trim() || null };
}
```

Add to `packages/core/src/index.ts`:

```ts
export * from './lrc';
export * from './lyrics';
```

- [ ] **Step 8: Run tests and typecheck**

Run: `pnpm --filter @breeze/core test` then `pnpm typecheck`
Expected: all tests PASS; typecheck exits 0.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/lrc.ts packages/core/src/lyrics.ts packages/core/src/index.ts packages/core/test/lrc.test.ts packages/core/test/lyrics.test.ts
git commit -m "feat(core): add LRC parser and LRCLIB lyrics client" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: youtubei.js mappers

**Files:**
- Create: `packages/core/src/mappers.ts`
- Test: `packages/core/test/mappers.test.ts`

**Interfaces:**
- Consumes: domain types from `types.ts`.
- Produces (internal to core, used by Task 5; not exported from `index.ts`):
  - `interface RawThumb`, `interface RawItem` (loose structural view of youtubei.js `MusicResponsiveListItem`, `MusicTwoRowItem`, `PlaylistPanelVideo`)
  - `toText(v: unknown): string`
  - `mapThumbs(raw): Thumbnail[]`
  - `mapTrack(raw: RawItem): Track | null` (null when there is no id)
  - `mapAlbumSummary(raw): AlbumSummary | null`
  - `mapArtistSummary(raw): ArtistSummary | null`
  - `mapPlaylistSummary(raw): PlaylistSummary | null`
  - `mapHomeItem(raw: RawItem): HomeItem | null` (dispatches on `item_type`)

The youtubei.js node shapes shift between versions, so every field is optional and `title` is `unknown`: youtubei.js uses `Text` objects whose `toString()` returns the text. Task 5's smoke script checks these against live data.

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/mappers.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @breeze/core test mappers`
Expected: FAIL, cannot resolve `../src/mappers`.

- [ ] **Step 3: Implement the mappers**

Create `packages/core/src/mappers.ts`:

```ts
import type { AlbumSummary, ArtistSummary, HomeItem, PlaylistSummary, Thumbnail, Track } from './types';

export interface RawThumb {
  url: string;
  width?: number;
  height?: number;
}

/** Loose view of the youtubei.js music nodes Breeze reads. Every field is optional on purpose. */
export interface RawItem {
  id?: string;
  video_id?: string;
  item_type?: string;
  title?: unknown;
  name?: unknown;
  artists?: { name: string; channel_id?: string }[];
  author?: { name?: string; channel_id?: string };
  album?: { id?: string; name: string };
  duration?: { seconds?: number };
  thumbnail?: { contents?: RawThumb[] } | RawThumb[];
  thumbnails?: RawThumb[];
  year?: string;
}

export const toText = (v: unknown): string => (v == null ? '' : String(v)).trim();

export function mapThumbs(raw: Pick<RawItem, 'thumbnail' | 'thumbnails'> | undefined): Thumbnail[] {
  const t = raw?.thumbnail;
  const list = Array.isArray(t) ? t : (t?.contents ?? raw?.thumbnails ?? []);
  return list
    .filter((x) => Boolean(x?.url))
    .map((x) => ({ url: x.url, width: x.width ?? 0, height: x.height ?? 0 }));
}

export function mapTrack(raw: RawItem): Track | null {
  const id = raw.id ?? raw.video_id;
  if (!id) return null;
  const artists = raw.artists?.length
    ? raw.artists.map((a) => ({ id: a.channel_id, name: a.name }))
    : raw.author?.name
      ? [{ id: raw.author.channel_id, name: raw.author.name }]
      : [];
  return {
    id,
    title: toText(raw.title),
    artists,
    album: raw.album?.name ? { id: raw.album.id, name: raw.album.name } : undefined,
    durationSec: raw.duration?.seconds,
    thumbnails: mapThumbs(raw),
  };
}

export function mapAlbumSummary(raw: RawItem): AlbumSummary | null {
  if (!raw.id) return null;
  return { id: raw.id, title: toText(raw.title), year: raw.year, thumbnails: mapThumbs(raw) };
}

export function mapArtistSummary(raw: RawItem): ArtistSummary | null {
  if (!raw.id) return null;
  return { id: raw.id, name: toText(raw.name ?? raw.title), thumbnails: mapThumbs(raw) };
}

export function mapPlaylistSummary(raw: RawItem): PlaylistSummary | null {
  if (!raw.id) return null;
  return { id: raw.id, title: toText(raw.title), author: raw.author?.name, thumbnails: mapThumbs(raw) };
}

export function mapHomeItem(raw: RawItem): HomeItem | null {
  switch (raw.item_type) {
    case 'song':
    case 'video': {
      const track = mapTrack(raw);
      return track && { kind: 'track', track };
    }
    case 'album': {
      const album = mapAlbumSummary(raw);
      return album && { kind: 'album', album };
    }
    case 'artist': {
      const artist = mapArtistSummary(raw);
      return artist && { kind: 'artist', artist };
    }
    case 'playlist': {
      const playlist = mapPlaylistSummary(raw);
      return playlist && { kind: 'playlist', playlist };
    }
    default:
      return null;
  }
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @breeze/core test mappers` then `pnpm typecheck`
Expected: PASS; typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/mappers.ts packages/core/test/mappers.test.ts
git commit -m "feat(core): map youtubei.js music nodes to domain types" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: InnerTubeSource + live smoke script

**Files:**
- Create: `packages/core/src/innertube.ts`, `packages/core/scripts/smoke.ts`
- Test: `packages/core/test/innertube.test.ts`

**Interfaces:**
- Consumes: `MusicSource`, `SearchFilter` (Task 1); `SourceError`, `toSourceError` (Task 1); `fetchLyrics` (Task 3); `mapTrack`, `mapHomeItem`, `mapThumbs`, `toText`, `RawItem` (Task 4).
- Produces (import path `@breeze/core/innertube`):
  - `interface MusicClient`: the subset of youtubei.js `yt.music` used: `search`, `getHomeFeed`, `getInfo`, `getAlbum`, `getArtist`, `getPlaylist`, `getUpNext`
  - `class InnerTubeSource implements MusicSource` with `constructor(music: MusicClient)` and `static create(): Promise<InnerTubeSource>`

Out of scope here: stream URL resolving (needs the youtubei.js player and a JS evaluator, so Plan 2 covers it) and playlist continuations past the first page.

- [ ] **Step 1: Install youtubei.js**

Run: `pnpm --filter @breeze/core add youtubei.js`
Expected: added to `packages/core/package.json` dependencies.

- [ ] **Step 2: Write the failing test**

Create `packages/core/test/innertube.test.ts`:

```ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @breeze/core test innertube`
Expected: FAIL, cannot resolve `../src/innertube`.

- [ ] **Step 4: Implement InnerTubeSource**

Create `packages/core/src/innertube.ts`:

```ts
import { Innertube } from 'youtubei.js';
import { SourceError, toSourceError } from './errors';
import { mapHomeItem, mapThumbs, mapTrack, type RawItem, toText } from './mappers';
import type { MusicSource, SearchFilter } from './source';
import type { Album, Artist, HomeItem, HomeSection, Playlist, SearchResult, Track } from './types';

/**
 * The subset of youtubei.js `yt.music` Breeze uses. Results are `any` on purpose:
 * youtubei.js node classes change between versions, and mappers.ts reads them defensively.
 */
export interface MusicClient {
  search(query: string, options?: { type?: string }): Promise<any>;
  getHomeFeed(): Promise<any>;
  getInfo(id: string): Promise<any>;
  getAlbum(id: string): Promise<any>;
  getArtist(id: string): Promise<any>;
  getPlaylist(id: string): Promise<any>;
  getUpNext(id: string): Promise<any>;
}

const FILTER_TYPE: Record<SearchFilter, string> = {
  songs: 'song',
  albums: 'album',
  artists: 'artist',
  playlists: 'playlist',
};

const YEAR = /\b(19|20)\d{2}\b/;

export class InnerTubeSource implements MusicSource {
  constructor(private readonly music: MusicClient) {}

  static async create(): Promise<InnerTubeSource> {
    const yt = await Innertube.create();
    return new InnerTubeSource(yt.music as unknown as MusicClient);
  }

  home(): Promise<HomeSection[]> {
    return guard(async () => {
      const feed = await this.music.getHomeFeed();
      const sections: any[] = feed?.sections ?? [];
      return sections
        .map((s) => ({ title: toText(s?.header?.title ?? s?.title), items: items(s?.contents) }))
        .filter((s) => s.items.length > 0);
    });
  }

  async search(query: string, filter?: SearchFilter): Promise<SearchResult> {
    const q = query.trim();
    if (!q) return emptySearch();
    return guard(async () => {
      const res = await this.music.search(q, filter ? { type: FILTER_TYPE[filter] } : undefined);
      const shelves: any[] = res?.contents ?? [];
      return groupItems(items(shelves.flatMap((s) => s?.contents ?? [])));
    });
  }

  track(id: string): Promise<Track> {
    return guard(async () => {
      const b = (await this.music.getInfo(id))?.basic_info;
      const track = b
        ? mapTrack({
            id: b.id ?? id,
            title: b.title,
            author: { name: b.author, channel_id: b.channel_id },
            duration: { seconds: b.duration },
            thumbnail: b.thumbnail,
          })
        : null;
      if (!track?.title) throw new SourceError('not_found', `Track ${id} not found`);
      return track;
    });
  }

  album(id: string): Promise<Album> {
    return guard(async () => {
      const a = await this.music.getAlbum(id);
      const h = a?.header;
      const title = toText(h?.title);
      const thumbnails = mapThumbs(h);
      const tracks = tracksOf(a?.contents).map((t) => ({
        ...t,
        album: t.album ?? { id, name: title },
        thumbnails: t.thumbnails.length > 0 ? t.thumbnails : thumbnails,
      }));
      const artists = h?.author?.name
        ? [{ id: h.author.channel_id, name: h.author.name }]
        : (tracks[0]?.artists ?? []);
      return { id, title, year: toText(h?.subtitle).match(YEAR)?.[0], artists, thumbnails, tracks };
    });
  }

  artist(id: string): Promise<Artist> {
    return guard(async () => {
      const r = await this.music.getArtist(id);
      const all = items((r?.sections ?? []).flatMap((s: any) => s?.contents ?? []));
      return {
        id,
        name: toText(r?.header?.title),
        thumbnails: mapThumbs(r?.header),
        topTracks: all.flatMap((i) => (i.kind === 'track' ? [i.track] : [])).slice(0, 10),
        albums: all.flatMap((i) => (i.kind === 'album' ? [i.album] : [])),
      };
    });
  }

  playlist(id: string): Promise<Playlist> {
    return guard(async () => {
      const p = await this.music.getPlaylist(id);
      return {
        id,
        title: toText(p?.header?.title),
        author: p?.header?.author?.name,
        thumbnails: mapThumbs(p?.header),
        tracks: tracksOf(p?.items ?? p?.contents),
      };
    });
  }

  upNext(trackId: string): Promise<Track[]> {
    return guard(async () => {
      const u = await this.music.getUpNext(trackId);
      return tracksOf(u?.contents).filter((t) => t.id !== trackId);
    });
  }
}

function items(raw: unknown): HomeItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r: RawItem) => mapHomeItem(r)).filter((i): i is HomeItem => i !== null);
}

function tracksOf(raw: unknown): Track[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r: RawItem) => mapTrack(r)).filter((t): t is Track => t !== null);
}

function groupItems(list: HomeItem[]): SearchResult {
  const r = emptySearch();
  for (const i of list) {
    if (i.kind === 'track') r.songs.push(i.track);
    else if (i.kind === 'album') r.albums.push(i.album);
    else if (i.kind === 'artist') r.artists.push(i.artist);
    else r.playlists.push(i.playlist);
  }
  return r;
}

function emptySearch(): SearchResult {
  return { songs: [], albums: [], artists: [], playlists: [] };
}

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw toSourceError(e);
  }
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @breeze/core test` then `pnpm typecheck`
Expected: all tests PASS; typecheck exits 0.

- [ ] **Step 6: Write the live smoke script**

Create `packages/core/scripts/smoke.ts`:

```ts
// Manual check against live YouTube Music. Not run in CI.
import { fetchLyrics } from '../src/lyrics';
import { InnerTubeSource } from '../src/innertube';

const src = await InnerTubeSource.create();

const home = await src.home();
console.log('home sections:', home.length, home.map((s) => `${s.title} (${s.items.length})`).slice(0, 5));

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
console.log('up next:', (await src.upNext(song.id)).slice(0, 3).map((t) => t.title));

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

const lyrics = await fetchLyrics({
  title: song.title,
  artist: song.artists[0]?.name ?? '',
  album: song.album?.name,
  durationSec: song.durationSec,
});
console.log('lyrics:', lyrics.synced ? `${lyrics.synced.length} synced lines` : lyrics.plain ? 'plain only' : 'none');
```

- [ ] **Step 7: Run the smoke script and fix mapping gaps**

Run: `pnpm --filter @breeze/core smoke`
Expected: `songs` > 0. The first song has a non-empty `title`, at least one artist, `durationSec`, and thumbnails. Album, artist and home all print non-empty values.

If any field prints empty, `''`, `undefined` or `0`, find the real field name. Add `console.dir(rawObject, { depth: 3 })` temporarily in the matching `InnerTubeSource` method and re-run. Then update `RawItem` / the mapper or method in `mappers.ts` / `innertube.ts`. Add a unit test in `mappers.test.ts` or `innertube.test.ts` that uses the real shape you saw. Run `pnpm --filter @breeze/core test` until green, and remove the `console.dir`.

If the run fails with a `blocked` error (YouTube bot check), retry from another network. Do not change code for this.

- [ ] **Step 8: Commit**

```bash
git add packages/core/package.json pnpm-lock.yaml packages/core/src/innertube.ts packages/core/src/mappers.ts packages/core/scripts/smoke.ts packages/core/test/innertube.test.ts packages/core/test/mappers.test.ts
git commit -m "feat(core): add InnerTubeSource backed by youtubei.js" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Storage contract + MemoryStorage

**Files:**
- Create: `packages/core/src/storage.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/storage.test.ts`

**Interfaces:**
- Consumes: `LocalPlaylist`, `Settings`, `Track` from `types.ts`.
- Produces:
  - `interface Storage` (methods exactly as in the spec §3.1)
  - `DEFAULT_SETTINGS: Settings` = `{ theme: 'system', audioQuality: 'high', autoplay: true, volume: 0.8 }`
  - `HISTORY_LIMIT = 500`
  - `LIKED_PLAYLIST_ID = 'liked'`: liked songs are stored as a `LocalPlaylist` with this id
  - `pushHistory(history: Track[], track: Track, limit?: number): Track[]`: newest first, de-duplicated by id
  - `class MemoryStorage implements Storage`: for tests and as the reference behaviour for the desktop and web storages in Plans 2 and 3

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/storage.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, HISTORY_LIMIT, MemoryStorage, pushHistory } from '../src/storage';
import type { LocalPlaylist, Track } from '../src/types';

const t = (id: string): Track => ({ id, title: id, artists: [], thumbnails: [] });
const pl = (id: string, createdAt: number): LocalPlaylist => ({ id, name: id, tracks: [], createdAt, updatedAt: createdAt });

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @breeze/core test storage`
Expected: FAIL, cannot resolve `../src/storage`.

- [ ] **Step 3: Implement storage**

Create `packages/core/src/storage.ts`:

```ts
import type { LocalPlaylist, Settings, Track } from './types';

export interface Storage {
  getPlaylists(): Promise<LocalPlaylist[]>;
  savePlaylist(p: LocalPlaylist): Promise<void>;
  deletePlaylist(id: string): Promise<void>;
  getSettings(): Promise<Settings>;
  saveSettings(s: Settings): Promise<void>;
  addHistory(t: Track): Promise<void>;
  getHistory(limit: number): Promise<Track[]>;
}

export const DEFAULT_SETTINGS: Settings = { theme: 'system', audioQuality: 'high', autoplay: true, volume: 0.8 };
export const HISTORY_LIMIT = 500;
/** Liked songs are stored as a LocalPlaylist with this id. */
export const LIKED_PLAYLIST_ID = 'liked';

export function pushHistory(history: Track[], track: Track, limit = HISTORY_LIMIT): Track[] {
  return [track, ...history.filter((h) => h.id !== track.id)].slice(0, limit);
}

export class MemoryStorage implements Storage {
  private playlists = new Map<string, LocalPlaylist>();
  private settings: Settings = { ...DEFAULT_SETTINGS };
  private history: Track[] = [];

  async getPlaylists(): Promise<LocalPlaylist[]> {
    return [...this.playlists.values()].map((p) => structuredClone(p)).sort((a, b) => a.createdAt - b.createdAt);
  }

  async savePlaylist(p: LocalPlaylist): Promise<void> {
    this.playlists.set(p.id, structuredClone(p));
  }

  async deletePlaylist(id: string): Promise<void> {
    this.playlists.delete(id);
  }

  async getSettings(): Promise<Settings> {
    return { ...this.settings };
  }

  async saveSettings(s: Settings): Promise<void> {
    this.settings = { ...s };
  }

  async addHistory(t: Track): Promise<void> {
    this.history = pushHistory(this.history, t);
  }

  async getHistory(limit: number): Promise<Track[]> {
    return this.history.slice(0, limit);
  }
}
```

Add to `packages/core/src/index.ts`:

```ts
export * from './storage';
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @breeze/core test` then `pnpm typecheck`
Expected: all tests PASS; typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/storage.ts packages/core/src/index.ts packages/core/test/storage.test.ts
git commit -m "feat(core): add Storage contract and MemoryStorage" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Lint, CI, and push to GitHub

**Files:**
- Create: `biome.json`, `.github/workflows/ci.yml`
- Modify: `package.json` (lint scripts)

**Interfaces:**
- Consumes: root `test` and `typecheck` scripts (Task 1).
- Produces: root `lint` and `lint:fix` scripts; CI that later plans extend.

- [ ] **Step 1: Add Biome**

Run: `pnpm add -Dw @biomejs/biome`

Create `biome.json`:

```json
{
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "formatter": { "indentStyle": "space", "lineWidth": 120 },
  "javascript": { "formatter": { "quoteStyle": "single" } },
  "linter": {
    "rules": {
      "suspicious": { "noExplicitAny": "off" },
      "style": { "noNonNullAssertion": "off" }
    }
  }
}
```

Add to root `package.json` `scripts`:

```json
"lint": "biome check .",
"lint:fix": "biome check --write ."
```

- [ ] **Step 2: Format and verify lint passes**

Run: `pnpm lint:fix` then `pnpm lint`
Expected: `pnpm lint` exits 0. If it reports a rule violation that `--write` cannot fix, fix that line by hand. Do not disable more rules.

- [ ] **Step 3: Verify everything still passes**

Run: `pnpm typecheck` then `pnpm test`
Expected: both exit 0.

- [ ] **Step 4: Add CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: ['**']
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
```

- [ ] **Step 5: Commit**

```bash
git add biome.json .github/workflows/ci.yml package.json pnpm-lock.yaml packages
git commit -m "chore: add Biome lint and CI workflow" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Push to GitHub**

Run:

```bash
git remote add origin https://github.com/mrtheo-hub/Breeze-Music-Main.git
git push -u origin main
```

Expected: the push succeeds (Git Credential Manager may open a browser sign-in the first time). The GitHub Actions "CI" run on `main` goes green; check it at `https://github.com/mrtheo-hub/Breeze-Music-Main/actions`.
