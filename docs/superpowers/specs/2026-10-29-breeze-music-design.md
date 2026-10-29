# Breeze Music — Design Spec

Date: 2026-10-29
Status: Draft, awaiting review
Repo: https://github.com/mrtheo-hub/Breeze-Music-Main

## 1. Goal

Breeze is a YouTube Music client with two front ends:

- **Windows desktop app** (priority): installable, auto-updating player.
- **Website** on Vercel: a landing/download page at `/` and a full web player at `/app`.

References only (no code copied): `mrtheo-hub/Breeze-Music` (Riff fork) and
`mrtheo-hub/Breeze-Music-2` (Liner fork).

### Success criteria (v1)

1. User installs the Windows app from a GitHub Release, searches a song, and hears it play within 3 s of clicking.
2. User opens the Vercel site, reads the landing page, downloads the installer, or clicks "Open web player" and plays a song in the browser.
3. Playlists and settings survive an app restart (desktop) or page reload (web).
4. The desktop app updates itself when a new GitHub Release is published.

### Out of scope (v1)

Linux, macOS and Android builds; Google account sign-in; cross-device sync;
equalizer and DSP effects; Discord Rich Presence; playlist import from other
services; downloads to disk; plugin system. The existing platform folders
(`Linux`, `MacOS Apple`, `Mobile (Android)`) stay untouched.

## 2. Constraints and risks

- **No official YouTube Music API.** Breeze uses the unofficial InnerTube API via
  [`youtubei.js`](https://github.com/LuanRT/YouTube.js). It can break without
  notice and is against YouTube's Terms of Service. Mitigation: all access goes
  through one `MusicSource` interface in `packages/core`, and `youtubei.js` is
  kept current.
- **Browsers cannot call InnerTube directly** (CORS) and cannot play raw
  `googlevideo` streams reliably. Web therefore uses Vercel serverless functions
  for data and the official YouTube IFrame Player for audio.
- **Vercel serverless limits**: functions are stateless with short execution
  time, so they return metadata only, never proxy audio bytes.

## 3. Architecture

pnpm workspace monorepo at the repo root (`D:\Breeze Music`).

```
D:\Breeze Music\
├─ package.json            pnpm workspace root, shared scripts
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ packages\
│  ├─ core\                TypeScript, no DOM, no Node-only APIs in public types
│  │  ├─ src\types.ts          Track, Album, Artist, Playlist, SearchResult, LyricsLine
│  │  ├─ src\source.ts         MusicSource interface
│  │  ├─ src\innertube.ts      youtubei.js implementation of MusicSource (server/main only)
│  │  ├─ src\queue.ts          pure queue logic (add, next, prev, shuffle, repeat)
│  │  ├─ src\lyrics.ts         LRCLIB client + LRC parser
│  │  └─ src\storage.ts        Storage interface (playlists, settings, history)
│  └─ ui\                  React components shared by both apps
│     ├─ src\theme\            CSS variables (tokens), light/dark
│     ├─ src\components\       TrackRow, PlayerBar, SearchBox, LyricsView, …
│     ├─ src\screens\          Home, Search, Album, Artist, Playlist, Library, Settings
│     └─ src\player\           PlayerContext + usePlayer(); takes an AudioEngine
├─ apps\
│  ├─ desktop\             Electron + Vite + React
│  │  ├─ electron\main.ts      window, IPC, InnerTube instance, auto-update
│  │  ├─ electron\preload.ts   exposes window.breeze (typed IPC bridge)
│  │  ├─ src\                  renderer: mounts packages/ui with desktop adapters
│  │  └─ electron-builder.yml  NSIS installer, GitHub Releases publish
│  └─ web\                 Vite + React, deployed to Vercel
│     ├─ src\landing\          landing / download page at /
│     ├─ src\app\              mounts packages/ui at /app with web adapters
│     ├─ api\                  Vercel functions: search, track, album, artist, playlist, home
│     └─ vercel.json
└─ docs\superpowers\specs\
```

### 3.1 Key interfaces

```ts
// packages/core/src/source.ts
export interface MusicSource {
  home(): Promise<HomeSection[]>;
  search(query: string, filter?: 'songs' | 'albums' | 'artists' | 'playlists'): Promise<SearchResult>;
  track(id: string): Promise<Track>;
  album(id: string): Promise<Album>;
  artist(id: string): Promise<Artist>;
  playlist(id: string): Promise<Playlist>;
  upNext(trackId: string): Promise<Track[]>; // radio / autoplay
}

// packages/ui/src/player/engine.ts
export interface AudioEngine {
  load(track: Track): Promise<void>;
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  setVolume(v: number): void; // 0..1
  on(event: 'time' | 'ended' | 'error' | 'state', cb: (payload: unknown) => void): () => void;
}

// packages/core/src/storage.ts
export interface Storage {
  getPlaylists(): Promise<LocalPlaylist[]>;
  savePlaylist(p: LocalPlaylist): Promise<void>;
  deletePlaylist(id: string): Promise<void>;
  getSettings(): Promise<Settings>;
  saveSettings(s: Settings): Promise<void>;
  addHistory(t: Track): Promise<void>;
  getHistory(limit: number): Promise<Track[]>;
}
```

`packages/ui` depends only on these three interfaces. Each app supplies adapters:

| Interface   | Desktop adapter                                 | Web adapter                               |
| ----------- | ----------------------------------------------- | ----------------------------------------- |
| MusicSource | IPC to `innertube.ts` in Electron main          | `fetch('/api/...')` to Vercel functions   |
| AudioEngine | HTML `<audio>` with stream URL resolved in main | YouTube IFrame Player API (hidden iframe) |
| Storage     | JSON files in `app.getPath('userData')` via IPC | IndexedDB (via `idb-keyval`)              |

Storage choice: JSON files instead of SQLite on desktop. v1 data is small
(playlists, settings, last 500 history items), and this avoids a native module
in the Electron build. Revisit if the library grows.

### 3.2 Data flow — play a song

Desktop:
1. User clicks a track. `usePlayer().play(track)` runs.
2. `AudioEngine.load` calls `window.breeze.resolveStream(id)` (IPC).
3. Main uses `youtubei.js` to get the best audio-only format and deciphered URL.
4. The renderer sets `<audio>.src` and plays. On a 403 or expiry, it re-resolves once.

Web:
1. User clicks a track. `usePlayer().play(track)` runs.
2. `AudioEngine.load` calls `player.loadVideoById(id)` on the hidden IFrame player.
3. IFrame state events map to `AudioEngine` events.

Metadata (search, album, etc.) on web: browser → `/api/search?q=` → Vercel function
creates/reuses a module-level `Innertube` instance → returns plain JSON typed by
`packages/core/src/types.ts`. Responses get `Cache-Control: s-maxage=300`.

### 3.3 Lyrics

Synced lyrics come from LRCLIB (`https://lrclib.net/api/get`), queried by
title, artist and duration. It is free, needs no key, and allows CORS, so both
apps call it directly from the renderer. If no synced lyrics are found, show
plain lyrics; if none at all, show an empty state.

## 4. v1 features

- Home feed (YouTube Music home sections)
- Search with filters: songs, albums, artists, playlists
- Album, artist and YouTube playlist pages
- Player: play, pause, seek, next, previous, shuffle, repeat (off/all/one), volume
- Queue panel: view, reorder (drag), remove, clear; autoplay radio via `upNext` when the queue ends
- Library: local playlists (create, rename, delete, add/remove tracks), liked songs, recently played
- Synced lyrics panel
- Settings: theme (light/dark/system), audio quality (desktop), autoplay on/off
- Desktop only: media keys and Windows media overlay (`navigator.mediaSession`), tray icon, single-instance lock, auto-update
- Web only: landing page (hero, screenshots, features, Windows download button pointing to latest GitHub Release, "Open web player" link)

## 5. Error handling

- `MusicSource` errors surface as a typed `SourceError { kind: 'network' | 'blocked' | 'not_found' | 'parse' }`.
- UI shows an inline retry for failed screens, and a toast for failed playback.
- Playback failure on a track: skip to next after a toast; stop after 3 consecutive failures.
- Desktop stream URL expiry: re-resolve once, then treat as failure.
- Vercel functions return `{ error: kind }` with status 502/404, never a stack trace.
- IFrame "embedding disabled" (error 101/150): toast "This track can't play on the web", skip.

## 6. Delivery

- **Git**: monorepo pushed to `main` on `mrtheo-hub/Breeze-Music-Main`.
- **Web**: Vercel project with root directory `apps/web`, auto-deploy from `main`, previews for branches.
- **Desktop**: GitHub Actions workflow on tag `v*` runs `electron-builder --win --publish always`, producing an NSIS installer in a GitHub Release. `electron-updater` checks that release feed. Installer is unsigned in v1, so Windows SmartScreen will warn on first install.

## 7. Testing

- `packages/core`: Vitest unit tests for `queue.ts`, the LRC parser, and the InnerTube response mapping (against saved JSON fixtures, no live network in CI).
- `packages/ui`: Vitest + Testing Library for `PlayerContext` with a fake `AudioEngine`.
- `apps/web`: Playwright smoke test: landing loads, `/app` loads, search returns results (with a mocked `/api`).
- `apps/desktop`: manual smoke checklist in v1 (launch, search, play, skip, restart keeps playlist).
- CI on every push: typecheck, lint, unit tests.

## 8. Stack summary

pnpm, TypeScript (strict), React 19, Vite, Electron (current stable), `electron-builder`,
`electron-updater`, `youtubei.js`, `idb-keyval`, Vitest, Playwright, Vercel.
Node 22+ for development.

## 9. Open items for later versions

Google sign-in to access the user's own YouTube Music library; equalizer;
Discord Rich Presence; playlist import; Linux/macOS builds; Android app; code signing.
