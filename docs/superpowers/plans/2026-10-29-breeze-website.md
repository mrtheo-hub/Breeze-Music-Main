# Breeze Website Implementation Plan (Plan 3 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Breeze website, deployable to Vercel from `apps/web`.
- **Landing page:** at `/`, with a "Open the web player" button and an honest "Windows app (coming soon)" link.
- **Web player:** at `/app`. It reuses the desktop UI (`@breeze/ui`), gets YouTube Music data from one Vercel function, plays audio through the official YouTube IFrame player, and stores history and playlists in IndexedDB.

**Architecture:**
- **Browser:** `apps/web` is a Vite + React SPA. `src/main.tsx` lazy-loads either the landing page or the player.
- **Data path:** the player runs `PlayerController` with three web adapters:
  - `HttpMusicSource`, which fetches `/api/*`;
  - `IframeEngine`, the YouTube IFrame player in a visible dock;
  - `IdbStorage`, using `idb-keyval`.
- **API:** one pure function, `handleApi(method, path, query, getSource)`, wrapped in a Node `(req, res)` adapter.
- **Build:** `scripts/build-vercel.ts` emits Vercel's Build Output API directly: `.vercel/output/static` (the Vite build), one function `functions/api.func/index.mjs` (esbuild-bundled, including youtubei.js), and `config.json` (routes plus security headers). In local dev, `vite dev` mounts the same handler at `/api`.

**Tech Stack:** Vite 8, React 19, `@breeze/ui`, `@breeze/core` (InnerTubeSource), youtubei.js 18.3, esbuild 0.28, idb-keyval, YouTube IFrame Player API, Vercel Build Output API v3, Vitest 5, Testing Library + jsdom 29.

**Spec:** `docs/superpowers/specs/2026-10-29-breeze-music-design.md`

**Plan series (re-ordered 2026-10-29 at the user's request, website first):**
1. Done: monorepo + `packages/core`.
2. Done: desktop slice.
3. This plan: website (landing + web player + Vercel).
4. Desktop complete: album, artist and playlist pages, Library, queue panel, synced lyrics, settings, tray.
5. Release: electron-builder NSIS, GitHub Releases, auto-update, app icon. It also flips the landing page's Windows link to the real installer.

## Global Constraints

- Node 22+; pnpm workspace; TypeScript strict; React 19.
- **Web stack:** Vite + React. The landing page is at `/`, the web player at `/app`, data comes from a Vercel function, audio from the YouTube IFrame Player API, and storage is IndexedDB via `idb-keyval`.
- **What the function returns:** metadata only, never proxied audio. Success responses carry `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`. Errors return a JSON body `{ error, message }` with `no-store`, and never a stack trace.
- **youtubei.js boundary:** youtubei.js is imported only from `packages/core/src/innertube.ts` and `stream.ts`. On the web, only the server bundle reaches it; the browser bundle (`apps/web/dist`) must not contain `youtubei`.
- **Errors:** they reach the UI as `SourceError { kind: 'network' | 'blocked' | 'not_found' | 'parse' }`, including across HTTP.
- **Playback failures:** on a track, show a toast and skip to the next track. Stop after 3 consecutive failures, the same `PlayerController` behaviour as desktop.
- **Embedded player size:** the YouTube player stays visible at no less than 200×200 CSS px whenever a track is loaded, as the YouTube embed terms require.
- **Security headers on every response:** a CSP that allows scripts only from `'self'` and `https://www.youtube.com`, and frames only from the YouTube player hosts, plus `frame-ancestors 'none'`, `nosniff` and `strict-origin-when-cross-origin`.
- **UI:**
  - No emoji.
  - Colors only from CSS custom properties, except in the favicon SVG file.
  - Every data screen has loading, empty and error states; every control has an accessible name and a visible focus ring.
  - The layout works from 360 px wide upward.
- **Honesty:** the landing page claims only what exists. It says Breeze is not affiliated with YouTube or Google.
- No live network in CI tests. CI on every push: typecheck, lint, unit tests, plus the web Vercel build and a "no youtubei in the browser bundle" check.
- Commit messages end with exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Spec deviations (decided while planning):**
- **One bundled function via the Build Output API**, instead of one TypeScript file per route under `api/`. Vercel recommends a single shared function, and it doesn't document compiling TypeScript imported from workspace packages.
  - Spiked on 2026-10-29: an esbuild ESM bundle of `InnerTubeSource` came to 1.36 MB, ran under plain Node, and `search` returned 20 songs.
- **A visible player dock** (224×224, or 200×200 on phones) instead of a hidden iframe, because of YouTube's 200×200 minimum viewport.
- **Embedding-disabled tracks** (IFrame errors 101/150) fail as `not_found`. They show the existing controller toast "That track isn't available." instead of the spec's "This track can't play on the web".
- **No screenshots on the landing page yet.** There is nothing real to show until the app is released (Plan 5); no mock screenshots.
- **Error bodies** are `{ error: kind, message }`, a superset of the spec's `{ error: kind }`.

## Review Focus

1. **Malformed or hostile API input:** a 10,000-character `q`, ids like `..%2Fetc` or 65+ characters, unknown filters, POST, extra path segments. Each gets a JSON 400, 404 or 405 with no YouTube call and never a 500. Pinned in Task 1.
2. **YouTube blocking or a slow Vercel function:** a 503 with a JSON body, a 504 with an HTML body, or the network down. The web player shows the matching error state with "Try again", never a blank screen or a JSON parse crash. Pinned in Tasks 1 and 3.
3. **Embedding-disabled tracks mid-queue** (IFrame error 101/150 during or after a load): the track is skipped with a toast, and 3 in a row stop playback. Pinned in Task 4.
4. **The browser blocking playback after the async load** (`onAutoplayBlocked`): the player shows Play (paused), not an endless spinner, and the next tap plays. Pinned in Task 4.
5. **Two quick saves, or IndexedDB unavailable** (private browsing): no lost update within a tab; a storage failure rejects that call without wedging later ones; the player still boots on default settings. Pinned in Task 3.

---

## File map

```
packages\core\src\lazy.ts                      Task 2  shared "create once, retry on failure"
packages\core\test\lazy.test.ts                Task 2
apps\desktop\src\main\services.ts              Task 2  use core lazy()
apps\web\
  package.json, tsconfig.json, vitest.config.ts, src\env.d.ts   Task 1
  server\handler.ts                            Task 1  pure API router
  server\node.ts                               Task 2  Node (req,res) adapter + default export
  server\vercel-config.ts                      Task 2  routes, headers, function config
  scripts\build-vercel.ts                      Task 2  writes .vercel/output
  scripts\smoke-api.ts                         Task 2  live check (manual)
  vite.config.ts                               Task 2  /api in vite dev
  index.html, public\favicon.svg               Task 2 (index.html final in Task 2), Task 5 favicon
  src\main.tsx                                 Task 2 placeholder, Task 5 final
  src\http-source.ts, src\idb-storage.ts       Task 3
  src\youtube-api.ts, src\iframe-engine.ts     Task 4
  src\routes.ts, src\player.tsx, src\web.css   Task 5
  src\landing\Landing.tsx, src\landing\landing.css  Task 5
  vercel.json                                  Task 6
  test\*.test.ts(x)
packages\ui\src\styles.css                     Task 5  responsive block (<= 760 px)
docs\deploy-vercel.md                          Task 6
.github\workflows\ci.yml                       Task 6
package.json (root)                            Task 1  dev:web script
```

---

### Task 1: Web package + the API router

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vitest.config.ts`, `apps/web/src/env.d.ts`
- Create: `apps/web/server/handler.ts`, `apps/web/test/handler.test.ts`
- Modify: root `package.json` (add the `dev:web` script)

**Interfaces:**
- Consumes: `MusicSource`, `SearchFilter`, `SearchResult`, `SourceError`, `SourceErrorKind`, `toSourceError` from `@breeze/core`.
- Produces:
  - `interface ApiResponse { status: number; headers: Record<string, string>; body: string }`
  - `handleApi(method: string, path: string, query: URLSearchParams, getSource: () => Promise<MusicSource>): Promise<ApiResponse>`
    - `path` is everything after `/api/`, for example `"search"` or `"album/MPREb_x"`.
    - Routes: `home`; `search?q=&filter=`; and `track`, `album`, `artist`, `playlist`, `upnext`, each followed by `/:id`.
    - Ids must match `/^[A-Za-z0-9_-]{1,64}$/`. `q` is at most 200 characters after trimming. The filter is one of `songs`, `albums`, `artists`, `playlists`.
    - Error status codes: `not_found` gives 404, `blocked` 503, `network` and `parse` 502. A bad request is 400, an unknown route 404, a non-GET 405 with `allow: GET`.
    - An empty query returns an empty `SearchResult` without calling `getSource`.

- [ ] **Step 1: Scaffold**

Create `apps/web/package.json`:

```json
{
  "name": "@breeze/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "build:vercel": "tsx scripts/build-vercel.ts",
    "preview": "vite preview",
    "smoke:api": "tsx scripts/smoke-api.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p ."
  }
}
```

Create `apps/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "jsx": "react-jsx", "types": ["node"] },
  "include": ["src", "server", "scripts", "test", "vite.config.ts", "vitest.config.ts"]
}
```

Create `apps/web/vitest.config.ts`:

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // jsdom by default for UI code; server tests opt into node with a `@vitest-environment node` comment.
  test: { environment: 'jsdom', globals: true },
});
```

Create `apps/web/src/env.d.ts`:

```ts
/// <reference types="vite/client" />
```

Add `"dev:web": "pnpm --filter @breeze/web dev"` to the root `package.json` `scripts`.

Run:

```bash
pnpm --filter @breeze/web add @breeze/core@workspace:* @breeze/ui@workspace:* react react-dom lucide-react idb-keyval
pnpm --filter @breeze/web add -D vite @vitejs/plugin-react esbuild tsx typescript vitest jsdom @testing-library/react @testing-library/dom @types/react @types/react-dom @types/node
```

Expected:
- Both installs succeed.
- jsdom resolves to 29.x, because of the existing `overrides` in pnpm-workspace.yaml. Check with `pnpm --filter @breeze/web list jsdom`.

- [ ] **Step 2: Write the failing test**

Create `apps/web/test/handler.test.ts`:

```ts
// @vitest-environment node
import { type MusicSource, SourceError } from '@breeze/core';
import { describe, expect, it, vi } from 'vitest';
import { handleApi } from '../server/handler';

const track = { id: 'a', title: 'A', artists: [], thumbnails: [] };

function source(over: Partial<MusicSource> = {}): MusicSource {
  const missing = vi.fn(() => Promise.reject(new Error('not stubbed')));
  return {
    home: missing,
    search: missing,
    track: missing,
    album: missing,
    artist: missing,
    playlist: missing,
    upNext: missing,
    ...over,
  };
}

const call = (path: string, query = '', src: MusicSource = source(), method = 'GET') =>
  handleApi(method, path, new URLSearchParams(query), async () => src);
const body = (r: { body: string }) => JSON.parse(r.body);

describe('handleApi', () => {
  it('serves search with a CDN cache header', async () => {
    const search = vi.fn(async () => ({ songs: [track], albums: [], artists: [], playlists: [] }));
    const r = await call('search', 'q=+daft+punk+&filter=songs', source({ search }));
    expect(r.status).toBe(200);
    expect(search).toHaveBeenCalledWith('daft punk', 'songs');
    expect(r.headers['cache-control']).toBe('public, s-maxage=300, stale-while-revalidate=600');
    expect(r.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(body(r).songs).toHaveLength(1);
  });

  it('answers a blank query without touching YouTube', async () => {
    const getSource = vi.fn(async () => source());
    const r = await handleApi('GET', 'search', new URLSearchParams('q=%20%20'), getSource);
    expect(r.status).toBe(200);
    expect(body(r)).toEqual({ songs: [], albums: [], artists: [], playlists: [] });
    expect(getSource).not.toHaveBeenCalled();
  });

  it.each([
    ['home', 'home'],
    ['track/MPREb_x', 'track'],
    ['album/MPREb_x', 'album'],
    ['artist/UC-x_1', 'artist'],
    ['playlist/PLx', 'playlist'],
    ['upnext/abc123', 'upNext'],
  ] as const)('routes %s to source.%s', async (path, method) => {
    const fn = vi.fn(async () => ({ ok: true }));
    const r = await call(path, '', source({ [method]: fn } as Partial<MusicSource>));
    expect(r.status).toBe(200);
    if (method !== 'home') expect(fn).toHaveBeenCalledWith(path.split('/')[1]);
  });

  it.each([
    ['search', `q=${'x'.repeat(201)}`, 400],
    ['search', 'q=x&filter=videos', 400],
    ['album/..%2Fetc', '', 400],
    [`album/${'a'.repeat(65)}`, '', 400],
    ['album', '', 400],
    ['nope', '', 404],
    ['track/a/extra', '', 404],
    ['home/x', '', 404],
    ['', '', 404],
  ])('rejects "%s?%s" with %i and never calls YouTube', async (path, query, status) => {
    const getSource = vi.fn(async () => source());
    const r = await handleApi('GET', path, new URLSearchParams(query), getSource);
    expect(r.status).toBe(status);
    expect(getSource).not.toHaveBeenCalled();
    expect(r.headers['cache-control']).toBe('no-store');
    expect(typeof body(r).message).toBe('string');
  });

  it('rejects non-GET methods with 405 and an Allow header', async () => {
    const getSource = vi.fn(async () => source());
    const r = await handleApi('POST', 'home', new URLSearchParams(), getSource);
    expect(r.status).toBe(405);
    expect(r.headers.allow).toBe('GET');
    expect(getSource).not.toHaveBeenCalled();
  });

  it.each([
    ['Request to https://x failed with status code 429', 'blocked', 503],
    ['Video not found', 'not_found', 404],
    ['fetch failed', 'network', 502],
    ['something odd', 'parse', 502],
  ])('maps a source failure "%s" to %s / %i without caching', async (message, kind, status) => {
    const failing = source({
      track: async () => {
        throw new Error(message);
      },
    });
    const r = await call('track/abc', '', failing);
    expect(r.status).toBe(status);
    expect(body(r)).toEqual({ error: kind, message });
    expect(r.headers['cache-control']).toBe('no-store');
  });

  it('maps a failed YouTube connection', async () => {
    const r = await handleApi('GET', 'home', new URLSearchParams(), async () => {
      throw new SourceError('network', 'offline');
    });
    expect(r.status).toBe(502);
    expect(body(r)).toEqual({ error: 'network', message: 'offline' });
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter @breeze/web test`
Expected: FAIL, `../server/handler` cannot be resolved.

- [ ] **Step 4: Implement**

Create `apps/web/server/handler.ts`:

```ts
import {
  type MusicSource,
  type SearchFilter,
  type SearchResult,
  type SourceErrorKind,
  toSourceError,
} from '@breeze/core';

export interface ApiResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const FILTERS: readonly string[] = ['songs', 'albums', 'artists', 'playlists'];
const MAX_QUERY = 200;
const CACHE_OK = 'public, s-maxage=300, stale-while-revalidate=600';
const STATUS: Record<SourceErrorKind, number> = { not_found: 404, blocked: 503, network: 502, parse: 502 };
const EMPTY_SEARCH: SearchResult = { songs: [], albums: [], artists: [], playlists: [] };

function json(status: number, data: unknown, cache = 'no-store', extra: Record<string, string> = {}): ApiResponse {
  return {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache, ...extra },
    body: JSON.stringify(data),
  };
}

const ok = (data: unknown) => json(200, data, CACHE_OK);
const badRequest = (message: string) => json(400, { error: 'bad_request', message });
const unknownRoute = () => json(404, { error: 'not_found', message: 'Unknown API route' });

/** Route one /api request. Input is validated before YouTube is ever contacted. */
export async function handleApi(
  method: string,
  path: string,
  query: URLSearchParams,
  getSource: () => Promise<MusicSource>,
): Promise<ApiResponse> {
  if (method !== 'GET')
    return json(405, { error: 'method_not_allowed', message: 'Use GET' }, 'no-store', { allow: 'GET' });
  const [route, id, ...rest] = path.split('/').filter(Boolean);
  if (rest.length > 0) return unknownRoute();

  try {
    switch (route) {
      case 'home':
        if (id) return unknownRoute();
        return ok(await (await getSource()).home());
      case 'search': {
        if (id) return unknownRoute();
        const q = (query.get('q') ?? '').trim();
        if (q.length > MAX_QUERY) return badRequest(`q must be at most ${MAX_QUERY} characters`);
        const filter = query.get('filter');
        if (filter !== null && !FILTERS.includes(filter)) return badRequest('Unknown filter');
        if (!q) return ok(EMPTY_SEARCH);
        return ok(await (await getSource()).search(q, (filter ?? undefined) as SearchFilter | undefined));
      }
      case 'track':
      case 'album':
      case 'artist':
      case 'playlist':
      case 'upnext': {
        if (!id || !ID.test(id)) return badRequest('Invalid id');
        const src = await getSource();
        if (route === 'track') return ok(await src.track(id));
        if (route === 'album') return ok(await src.album(id));
        if (route === 'artist') return ok(await src.artist(id));
        if (route === 'playlist') return ok(await src.playlist(id));
        return ok(await src.upNext(id));
      }
      default:
        return unknownRoute();
    }
  } catch (e) {
    const err = toSourceError(e);
    return json(STATUS[err.kind], { error: err.kind, message: err.message });
  }
}
```

- [ ] **Step 5: Run tests, typecheck, lint**

Run: `pnpm --filter @breeze/web test`, then `pnpm typecheck`, then `pnpm lint:fix` and `pnpm lint`.
Expected: all handler tests PASS; typecheck exits 0; lint is clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web package.json pnpm-lock.yaml
git commit -m "feat(web): scaffold web app and validated API router" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Shared `lazy()`, the Node adapter, and the Vercel build

**Files:**
- Create: `packages/core/src/lazy.ts`, `packages/core/test/lazy.test.ts`
- Modify: `packages/core/src/index.ts` (export), `apps/desktop/src/main/services.ts` (use the core `lazy`, delete the local copy)
- Create: `apps/web/server/node.ts`, `apps/web/server/vercel-config.ts`
- Create: `apps/web/scripts/build-vercel.ts`, `apps/web/scripts/smoke-api.ts`, `apps/web/vite.config.ts`
- Create: `apps/web/index.html`, `apps/web/src/main.tsx` (placeholder, replaced in Task 5)
- Test: `apps/web/test/node.test.ts`, `apps/web/test/vercel-config.test.ts`

**Interfaces:**
- Consumes: `handleApi` (Task 1); `InnerTubeSource` (`@breeze/core/innertube`); `MusicSource`.
- Produces:
  - `lazy<T>(make: () => Promise<T>): () => Promise<T>` in `@breeze/core`. It shares one in-flight or settled promise; after a rejection, the next call tries again.
  - `createApiHandler(getSource): (req: IncomingMessage, res: ServerResponse) => Promise<void>`. It routes by the `__path` query parameter when present (Vercel rewrite), otherwise by the pathname after `/api/`.
  - `default export`: `createApiHandler(lazy(() => InnerTubeSource.create()))`.
  - `vercelConfig(): { version: 3; routes: VercelRoute[] }`, `SECURITY_HEADERS`, `CSP`, `FUNCTION_CONFIG`.
  - `pnpm --filter @breeze/web build:vercel` writes `apps/web/.vercel/output/{static/, functions/api.func/{index.mjs,.vc-config.json}, config.json}`.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/lazy.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { lazy } from '../src/lazy';

describe('lazy', () => {
  it('creates once and shares it, even for concurrent first calls', async () => {
    const make = vi.fn(async () => ({ n: 1 }));
    const get = lazy(make);
    const [a, b] = await Promise.all([get(), get()]);
    expect(a).toBe(b);
    expect(await get()).toBe(a);
    expect(make).toHaveBeenCalledTimes(1);
  });

  it('tries again after a failure', async () => {
    const make = vi.fn<() => Promise<number>>().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(7);
    const get = lazy(make);
    await expect(get()).rejects.toThrow('offline');
    expect(await get()).toBe(7);
    expect(make).toHaveBeenCalledTimes(2);
  });
});
```

Create `apps/web/test/node.test.ts`:

```ts
// @vitest-environment node
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { MusicSource } from '@breeze/core';
import { describe, expect, it, vi } from 'vitest';
import { createApiHandler } from '../server/node';

function fakeRes() {
  return {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: '',
    setHeader(k: string, v: string) {
      this.headers[k.toLowerCase()] = v;
    },
    end(b: string) {
      this.body = b;
    },
  };
}

function run(url: string | undefined, method: string | undefined, src: Partial<MusicSource>) {
  const res = fakeRes();
  const handler = createApiHandler(async () => src as MusicSource);
  return handler({ url, method } as IncomingMessage, res as unknown as ServerResponse).then(() => res);
}

describe('createApiHandler', () => {
  it('routes by pathname and writes status, headers and body', async () => {
    const search = vi.fn(async () => ({ songs: [], albums: [], artists: [], playlists: [] }));
    const res = await run('/api/search?q=daft', 'GET', { search });
    expect(search).toHaveBeenCalledWith('daft', undefined);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(JSON.parse(res.body).songs).toEqual([]);
  });

  it('routes by the __path rewrite parameter and keeps the rest of the query', async () => {
    const search = vi.fn(async () => ({ songs: [], albums: [], artists: [], playlists: [] }));
    await run('/api?__path=search&q=get%20lucky', 'GET', { search });
    expect(search).toHaveBeenCalledWith('get lucky', undefined);
  });

  it('routes a nested __path', async () => {
    const album = vi.fn(async () => ({ id: 'MPREb_x' }));
    await run('/api?__path=album/MPREb_x', 'GET', { album });
    expect(album).toHaveBeenCalledWith('MPREb_x');
  });

  it('treats a missing url and method as GET /', async () => {
    const res = await run(undefined, undefined, {});
    expect(res.statusCode).toBe(404);
  });
});
```

Create `apps/web/test/vercel-config.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CSP, FUNCTION_CONFIG, SECURITY_HEADERS, vercelConfig } from '../server/vercel-config';

const routes = vercelConfig().routes;
const indexOf = (pred: (r: (typeof routes)[number]) => boolean) => routes.findIndex(pred);

describe('vercelConfig', () => {
  it('is Build Output API v3', () => {
    expect(vercelConfig().version).toBe(3);
  });

  it('rewrites /api/* to the function before the filesystem, and the player after it', () => {
    const api = indexOf((r) => 'src' in r && r.src === '^/api/(.*)$');
    const fs = indexOf((r) => 'handle' in r && r.handle === 'filesystem');
    const app = indexOf((r) => 'src' in r && r.src === '^/app(?:/.*)?$');
    expect(api).toBeGreaterThanOrEqual(0);
    expect(api).toBeLessThan(fs);
    expect(app).toBeGreaterThan(fs);
    expect(routes[api]).toMatchObject({ dest: '/api?__path=$1', check: true });
    expect(routes[app]).toMatchObject({ dest: '/index.html' });
  });

  it('sends security headers on every path first', () => {
    expect(routes[0]).toMatchObject({ src: '^/(.*)$', headers: SECURITY_HEADERS, continue: true });
    expect(SECURITY_HEADERS['x-content-type-options']).toBe('nosniff');
    expect(SECURITY_HEADERS['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  it('allows scripts and frames only from Breeze and the YouTube player', () => {
    expect(CSP).toContain("script-src 'self' https://www.youtube.com");
    expect(CSP).toContain('frame-src https://www.youtube-nocookie.com https://www.youtube.com');
    expect(CSP).toContain("frame-ancestors 'none'");
    expect(CSP).toContain("object-src 'none'");
    expect(CSP).not.toContain('unsafe-eval');
  });

  it('caches hashed assets for a year', () => {
    const assets = routes.find((r) => 'src' in r && r.src === '^/assets/(.*)$');
    expect(assets).toMatchObject({
      headers: { 'cache-control': 'public, max-age=31536000, immutable' },
      continue: true,
    });
  });

  it('runs the function on Node 22 with a 15 s limit', () => {
    expect(FUNCTION_CONFIG).toEqual({
      runtime: 'nodejs22.x',
      handler: 'index.mjs',
      launcherType: 'Nodejs',
      maxDuration: 15,
    });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @breeze/core test lazy` and `pnpm --filter @breeze/web test node vercel-config`
Expected: FAIL. `../src/lazy`, `../server/node` and `../server/vercel-config` cannot be resolved.

- [ ] **Step 3: Implement `lazy` and switch desktop to it**

Create `packages/core/src/lazy.ts`:

```ts
/** Create `make()` once and share it. If it rejects, the next call tries again. */
export function lazy<T>(make: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => {
    pending ??= make().catch((e: unknown) => {
      pending = null;
      throw e;
    });
    return pending;
  };
}
```

Add `export * from './lazy';` to `packages/core/src/index.ts`.

In `apps/desktop/src/main/services.ts`:
- Delete the local `function lazy…` and its doc comment.
- Add `lazy` to the value import from `@breeze/core`. Keep the type imports `import type`.

Then run `pnpm --filter @breeze/desktop test`. Expected: still all pass.

- [ ] **Step 4: Implement the adapter and the Vercel config**

Create `apps/web/server/node.ts`:

```ts
import type { IncomingMessage, ServerResponse } from 'node:http';
import { lazy, type MusicSource } from '@breeze/core';
import { InnerTubeSource } from '@breeze/core/innertube';
import { handleApi } from './handler';

/** Node (req, res) entry point, used by the Vercel function and by `vite dev`. */
export function createApiHandler(getSource: () => Promise<MusicSource>) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    // On Vercel, /api/* is rewritten to /api?__path=*; in dev the path is still in the pathname.
    const path = url.searchParams.get('__path') ?? url.pathname.replace(/^\/api\/?/, '');
    url.searchParams.delete('__path');
    const out = await handleApi(req.method ?? 'GET', path, url.searchParams, getSource);
    res.statusCode = out.status;
    for (const [key, value] of Object.entries(out.headers)) res.setHeader(key, value);
    res.end(out.body);
  };
}

export default createApiHandler(lazy(() => InnerTubeSource.create()));
```

Create `apps/web/server/vercel-config.ts`:

```ts
export type VercelRoute =
  | { src: string; dest?: string; headers?: Record<string, string>; continue?: boolean; check?: boolean }
  | { handle: 'filesystem' };

export const CSP = [
  "default-src 'self'",
  "script-src 'self' https://www.youtube.com",
  'frame-src https://www.youtube-nocookie.com https://www.youtube.com',
  "img-src 'self' data: https://*.ytimg.com https://*.googleusercontent.com https://*.ggpht.com",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
].join('; ');

export const SECURITY_HEADERS: Record<string, string> = {
  'content-security-policy': CSP,
  'x-content-type-options': 'nosniff',
  // The YouTube player needs the page origin as referrer (IFrame error 153 otherwise).
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};

export const FUNCTION_CONFIG = {
  runtime: 'nodejs22.x',
  handler: 'index.mjs',
  launcherType: 'Nodejs',
  maxDuration: 15,
} as const;

export function vercelConfig(): { version: 3; routes: VercelRoute[] } {
  return {
    version: 3,
    routes: [
      { src: '^/(.*)$', headers: SECURITY_HEADERS, continue: true },
      { src: '^/assets/(.*)$', headers: { 'cache-control': 'public, max-age=31536000, immutable' }, continue: true },
      { src: '^/api/(.*)$', dest: '/api?__path=$1', check: true },
      { handle: 'filesystem' },
      { src: '^/app(?:/.*)?$', dest: '/index.html' },
    ],
  };
}
```

- [ ] **Step 5: Run the new tests**

Run: `pnpm --filter @breeze/core test` and `pnpm --filter @breeze/web test`
Expected: all PASS.

- [ ] **Step 6: Build script, dev server, smoke script, placeholder page**

Create `apps/web/index.html`. It is final as written here; Task 5 only adds the favicon file it references:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta
      name="description"
      content="Breeze is a free, open-source music player for YouTube Music, in your browser and on Windows."
    />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <title>Breeze</title>
  </head>
  <body>
    <div id="root"></div>
    <div id="yt-dock" class="yt-dock" hidden></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `apps/web/src/main.tsx`. This is a placeholder until Task 5:

```tsx
// Placeholder until Task 5 wires the landing page and the player.
(document.getElementById('root') as HTMLElement).textContent = 'Breeze';
```

Create `apps/web/vite.config.ts`:

```ts
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/** In `vite dev`, serve /api/* with the same handler the Vercel function runs. */
function apiDevServer(): Plugin {
  return {
    name: 'breeze-api-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        try {
          const mod = await server.ssrLoadModule('/server/node.ts');
          await mod.default(req, res);
        } catch (e) {
          next(e);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), apiDevServer()],
  resolve: { dedupe: ['react', 'react-dom'] },
  // src/main.tsx uses top-level await.
  build: { target: 'es2022' },
});
```

Create `apps/web/scripts/build-vercel.ts`:

```ts
// Builds the site in Vercel's Build Output API v3 layout: .vercel/output/{static,functions,config.json}.
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { build as bundle } from 'esbuild';
import { build as viteBuild } from 'vite';
import { FUNCTION_CONFIG, vercelConfig } from '../server/vercel-config';

// esbuild's ESM output has no `require`; some bundled CommonJS deps call it.
const REQUIRE_SHIM =
  "import { createRequire as __breezeCreateRequire } from 'node:module'; const require = __breezeCreateRequire(import.meta.url);";

const root = join(import.meta.dirname, '..');
const out = join(root, '.vercel', 'output');
const fn = join(out, 'functions', 'api.func');

await rm(out, { recursive: true, force: true });
await viteBuild({ root, logLevel: 'warn' });
await mkdir(join(out, 'static'), { recursive: true });
await cp(join(root, 'dist'), join(out, 'static'), { recursive: true });

await bundle({
  entryPoints: [join(root, 'server', 'node.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: join(fn, 'index.mjs'),
  banner: { js: REQUIRE_SHIM },
  legalComments: 'none',
  logLevel: 'warning',
});
await writeFile(join(fn, '.vc-config.json'), `${JSON.stringify(FUNCTION_CONFIG, null, 2)}\n`);
await writeFile(join(out, 'config.json'), `${JSON.stringify(vercelConfig(), null, 2)}\n`);
console.log(`Wrote ${out}`);
```

Create `apps/web/scripts/smoke-api.ts`:

```ts
// Live check of the API against YouTube Music. Not run in CI.
//   pnpm --filter @breeze/web smoke:api              -> source handler
//   pnpm --filter @breeze/web smoke:api -- --bundle  -> built .vercel function
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

const useBundle = process.argv.includes('--bundle');
const mod = useBundle
  ? await import(pathToFileURL(join(import.meta.dirname, '..', '.vercel/output/functions/api.func/index.mjs')).href)
  : await import('../server/node');
const handler = mod.default as Handler;

function summary(data: any): string {
  if (Array.isArray(data)) return `${data.length} sections`;
  if (data?.songs) return `${data.songs.length} songs`;
  return data?.error ?? 'ok';
}

for (const url of [
  '/api/home',
  '/api/search?q=daft%20punk&filter=songs',
  '/api/album/..bad',
  '/api?__path=search&q=get%20lucky',
]) {
  const res = {
    statusCode: 0,
    body: '',
    setHeader() {},
    end(b: string) {
      this.body = b;
    },
  };
  await handler({ url, method: 'GET' } as IncomingMessage, res as unknown as ServerResponse);
  console.log(useBundle ? '[bundle]' : '[source]', url, res.statusCode, summary(JSON.parse(res.body)));
}
```

- [ ] **Step 7: Build and verify the output**

Run: `pnpm --filter @breeze/web build:vercel`
Expected:
- It prints `Wrote …/apps/web/.vercel/output`.
- These exist: `apps/web/.vercel/output/static/index.html`, `apps/web/.vercel/output/functions/api.func/index.mjs` (about 1.3 MB), `apps/web/.vercel/output/functions/api.func/.vc-config.json` and `apps/web/.vercel/output/config.json`.

Run: `pnpm --filter @breeze/web smoke:api` and then `pnpm --filter @breeze/web smoke:api -- --bundle`
Expected: for both the source and the bundle, these four lines:
- `/api/home 200 N sections` (N ≥ 1)
- `/api/search… 200 M songs` (M ≥ 1)
- `/api/album/..bad 400 bad_request`
- `/api?__path=search… 200 K songs`

A `503 blocked` answer means YouTube is rate-limiting this network. Retry later; do not change code for it.

- [ ] **Step 8: Typecheck, lint, all tests**

Run: `pnpm typecheck`, then `pnpm lint:fix` and `pnpm lint`, then `pnpm test`.
Expected: all clean; every package passes.

- [ ] **Step 9: Commit**

```bash
git add packages/core apps/desktop/src/main/services.ts apps/web pnpm-lock.yaml
git commit -m "feat(web): Node API adapter and Vercel Build Output; share lazy() in core" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Browser data and storage adapters

**Files:**
- Create: `apps/web/src/http-source.ts`, `apps/web/src/idb-storage.ts`
- Test: `apps/web/test/http-source.test.ts`, `apps/web/test/idb-storage.test.ts`

**Interfaces:**
- Consumes: `MusicSource`, `Storage`, `SourceError`, `SourceErrorKind`, `Fetcher`, `DEFAULT_SETTINGS`, `pushHistory`, `LocalPlaylist`, `Settings`, `Track` (`@breeze/core`); `idb-keyval` (`get`, `set`).
- Produces:
  - `class HttpMusicSource implements MusicSource { constructor(fetcher?: Fetcher, base?: string) }`, with `base` defaulting to `'/api'`.
    - JSON `{ error, message }` bodies become `SourceError(error, message)`.
    - Non-JSON or unknown bodies map by status: 404 → `not_found`; 429 or 503 → `blocked`; other 5xx → `network`; anything else → `parse`.
    - `fetch` throwing becomes `network`.
  - `interface KeyValue { get<T>(key: string): Promise<T | undefined>; set(key: string, value: unknown): Promise<void> }`
  - `class IdbStorage implements Storage { constructor(kv?: KeyValue) }`. Its keys are `breeze:playlists`, `breeze:settings` and `breeze:history`. Writes are serialised per instance, and a failed write does not block later ones.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/test/http-source.test.ts`:

```ts
import { type Fetcher, SourceError } from '@breeze/core';
import { describe, expect, it, vi } from 'vitest';
import { HttpMusicSource } from '../src/http-source';

function respond(status: number, body: unknown, isJson = true): ReturnType<Fetcher> {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (!isJson) throw new SyntaxError('Unexpected token <');
      return body;
    },
  });
}

describe('HttpMusicSource', () => {
  it('builds encoded URLs for every method', async () => {
    const fetcher = vi.fn<Fetcher>(() => respond(200, []));
    const src = new HttpMusicSource(fetcher);
    await src.home();
    await src.search('daft punk & co', 'songs');
    await src.search('x');
    await src.track('a/b');
    await src.album('MPREb_x');
    await src.artist('UC1');
    await src.playlist('PL1');
    await src.upNext('v1');
    expect(fetcher.mock.calls.map((c) => c[0])).toEqual([
      '/api/home',
      '/api/search?q=daft+punk+%26+co&filter=songs',
      '/api/search?q=x',
      '/api/track/a%2Fb',
      '/api/album/MPREb_x',
      '/api/artist/UC1',
      '/api/playlist/PL1',
      '/api/upnext/v1',
    ]);
  });

  it('returns the JSON body on success', async () => {
    const src = new HttpMusicSource(() => respond(200, [{ title: 'Quick picks', items: [] }]));
    expect(await src.home()).toEqual([{ title: 'Quick picks', items: [] }]);
  });

  it('rebuilds SourceError from a JSON error body', async () => {
    const src = new HttpMusicSource(() => respond(503, { error: 'blocked', message: 'status code 429' }));
    const err = await src.home().catch((e) => e);
    expect(err).toBeInstanceOf(SourceError);
    expect(err).toMatchObject({ kind: 'blocked', message: 'status code 429' });
  });

  it.each([
    [504, 'network'],
    [502, 'network'],
    [503, 'blocked'],
    [429, 'blocked'],
    [404, 'not_found'],
    [418, 'parse'],
  ] as const)('maps a non-JSON %i to %s', async (status, kind) => {
    const src = new HttpMusicSource(() => respond(status, null, false));
    expect(await src.home().catch((e) => e.kind)).toBe(kind);
  });

  it('maps a bad_request body (not a SourceError kind) by status', async () => {
    const src = new HttpMusicSource(() => respond(400, { error: 'bad_request', message: 'Invalid id' }));
    expect(await src.track('x').catch((e) => [e.kind, e.message])).toEqual(['parse', 'Invalid id']);
  });

  it('maps a non-JSON 200 to parse', async () => {
    const src = new HttpMusicSource(() => respond(200, null, false));
    expect(await src.home().catch((e) => e.kind)).toBe('parse');
  });

  it('maps a thrown fetch to network', async () => {
    const src = new HttpMusicSource(() => Promise.reject(new TypeError('Failed to fetch')));
    const err = await src.home().catch((e) => e);
    expect(err).toBeInstanceOf(SourceError);
    expect(err.kind).toBe('network');
  });
});
```

Create `apps/web/test/idb-storage.test.ts`:

```ts
import { DEFAULT_SETTINGS, HISTORY_LIMIT, type LocalPlaylist, type Track } from '@breeze/core';
import { describe, expect, it } from 'vitest';
import { IdbStorage, type KeyValue } from '../src/idb-storage';

const t = (id: string): Track => ({ id, title: id, artists: [], thumbnails: [] });
const pl = (id: string, createdAt: number): LocalPlaylist => ({
  id,
  name: id,
  tracks: [],
  createdAt,
  updatedAt: createdAt,
});
const tick = () => new Promise((r) => setTimeout(r, 0));

/** In-memory KeyValue with real async gaps, so unserialised read-modify-write would interleave. */
function memoryKv(fail: { get?: number } = {}) {
  const data = new Map<string, unknown>();
  const kv: KeyValue = {
    async get<T>(key: string) {
      await tick();
      if (fail.get && fail.get-- > 0) throw new Error('IndexedDB unavailable');
      return structuredClone(data.get(key)) as T | undefined;
    },
    async set(key, value) {
      await tick();
      data.set(key, structuredClone(value));
    },
  };
  return { kv, data };
}

describe('IdbStorage', () => {
  it('starts with defaults', async () => {
    const s = new IdbStorage(memoryKv().kv);
    expect(await s.getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(await s.getPlaylists()).toEqual([]);
    expect(await s.getHistory(10)).toEqual([]);
  });

  it('keeps both of two concurrent playlist saves', async () => {
    const s = new IdbStorage(memoryKv().kv);
    await Promise.all([s.savePlaylist(pl('a', 1)), s.savePlaylist(pl('b', 2))]);
    expect((await s.getPlaylists()).map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('replaces by id, deletes, and sorts by creation time', async () => {
    const s = new IdbStorage(memoryKv().kv);
    await s.savePlaylist(pl('b', 2));
    await s.savePlaylist(pl('a', 1));
    await s.savePlaylist({ ...pl('b', 2), name: 'renamed' });
    expect((await s.getPlaylists()).map((p) => p.name)).toEqual(['a', 'renamed']);
    await s.deletePlaylist('a');
    expect((await s.getPlaylists()).map((p) => p.id)).toEqual(['b']);
  });

  it('merges saved settings over defaults', async () => {
    const { kv, data } = memoryKv();
    data.set('breeze:settings', { theme: 'dark' });
    expect(await new IdbStorage(kv).getSettings()).toEqual({ ...DEFAULT_SETTINGS, theme: 'dark' });
  });

  it('records history newest first, de-duplicated and capped', async () => {
    const s = new IdbStorage(memoryKv().kv);
    for (let i = 0; i < HISTORY_LIMIT + 3; i++) await s.addHistory(t(String(i)));
    await s.addHistory(t('5'));
    const history = await s.getHistory(HISTORY_LIMIT + 10);
    expect(history).toHaveLength(HISTORY_LIMIT);
    expect(history[0]?.id).toBe('5');
    expect(history.filter((x) => x.id === '5')).toHaveLength(1);
  });

  it('does not let callers mutate stored data', async () => {
    const s = new IdbStorage(memoryKv().kv);
    await s.addHistory(t('x'));
    const [first] = await s.getHistory(1);
    if (first) first.title = 'changed';
    expect((await s.getHistory(1))[0]?.title).toBe('x');
  });

  it('a failing write rejects without blocking the next one', async () => {
    const s = new IdbStorage(memoryKv({ get: 1 }).kv);
    await expect(s.addHistory(t('a'))).rejects.toThrow('IndexedDB unavailable');
    await s.addHistory(t('b'));
    expect((await s.getHistory(5)).map((x) => x.id)).toEqual(['b']);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @breeze/web test http-source idb-storage`
Expected: FAIL; the modules cannot be resolved.

- [ ] **Step 3: Implement**

Create `apps/web/src/http-source.ts`:

```ts
import {
  type Album,
  type Artist,
  type Fetcher,
  type HomeSection,
  type MusicSource,
  type Playlist,
  type SearchFilter,
  type SearchResult,
  SourceError,
  type SourceErrorKind,
  type Track,
} from '@breeze/core';

const KINDS: readonly string[] = ['network', 'blocked', 'not_found', 'parse'];
const isKind = (v: unknown): v is SourceErrorKind => typeof v === 'string' && KINDS.includes(v);

function kindForStatus(status: number): SourceErrorKind {
  if (status === 404) return 'not_found';
  if (status === 429 || status === 503) return 'blocked';
  if (status >= 500) return 'network';
  return 'parse';
}

/** MusicSource over Breeze's own /api, which runs youtubei.js on the server. */
export class HttpMusicSource implements MusicSource {
  constructor(
    private readonly fetcher: Fetcher = (url) => fetch(url),
    private readonly base = '/api',
  ) {}

  home(): Promise<HomeSection[]> {
    return this.get('home');
  }

  search(query: string, filter?: SearchFilter): Promise<SearchResult> {
    const params = new URLSearchParams({ q: query });
    if (filter) params.set('filter', filter);
    return this.get(`search?${params}`);
  }

  track(id: string): Promise<Track> {
    return this.get(`track/${encodeURIComponent(id)}`);
  }

  album(id: string): Promise<Album> {
    return this.get(`album/${encodeURIComponent(id)}`);
  }

  artist(id: string): Promise<Artist> {
    return this.get(`artist/${encodeURIComponent(id)}`);
  }

  playlist(id: string): Promise<Playlist> {
    return this.get(`playlist/${encodeURIComponent(id)}`);
  }

  upNext(trackId: string): Promise<Track[]> {
    return this.get(`upnext/${encodeURIComponent(trackId)}`);
  }

  private async get<T>(path: string): Promise<T> {
    let res: Awaited<ReturnType<Fetcher>>;
    try {
      res = await this.fetcher(`${this.base}/${path}`);
    } catch (e) {
      throw new SourceError('network', "Can't reach Breeze's server.", { cause: e });
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch (e) {
      // Vercel timeouts and proxies answer with HTML.
      throw new SourceError(res.ok ? 'parse' : kindForStatus(res.status), `Unexpected response (${res.status})`, {
        cause: e,
      });
    }
    if (res.ok) return body as T;
    const err = (body ?? {}) as { error?: unknown; message?: unknown };
    throw new SourceError(
      isKind(err.error) ? err.error : kindForStatus(res.status),
      typeof err.message === 'string' ? err.message : `Request failed (${res.status})`,
    );
  }
}
```

Create `apps/web/src/idb-storage.ts`:

```ts
import {
  DEFAULT_SETTINGS,
  type LocalPlaylist,
  pushHistory,
  type Settings,
  type Storage,
  type Track,
} from '@breeze/core';
import { get, set } from 'idb-keyval';

export interface KeyValue {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
}

const INDEXED_DB: KeyValue = {
  get: <T>(key: string) => get<T>(key),
  set: (key, value) => set(key, value),
};

const KEYS = { playlists: 'breeze:playlists', settings: 'breeze:settings', history: 'breeze:history' } as const;

/** Browser Storage on IndexedDB. Writes are queued so read-modify-write updates never interleave. */
export class IdbStorage implements Storage {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly kv: KeyValue = INDEXED_DB) {}

  async getPlaylists(): Promise<LocalPlaylist[]> {
    const list = (await this.kv.get<LocalPlaylist[]>(KEYS.playlists)) ?? [];
    return structuredClone(list).sort((a, b) => a.createdAt - b.createdAt);
  }

  savePlaylist(p: LocalPlaylist): Promise<void> {
    return this.update<LocalPlaylist[]>(KEYS.playlists, [], (list) => {
      const copy = structuredClone(p);
      const at = list.findIndex((x) => x.id === p.id);
      if (at === -1) list.push(copy);
      else list[at] = copy;
      return list;
    });
  }

  deletePlaylist(id: string): Promise<void> {
    return this.update<LocalPlaylist[]>(KEYS.playlists, [], (list) => list.filter((p) => p.id !== id));
  }

  async getSettings(): Promise<Settings> {
    return { ...DEFAULT_SETTINGS, ...((await this.kv.get<Partial<Settings>>(KEYS.settings)) ?? {}) };
  }

  saveSettings(s: Settings): Promise<void> {
    return this.update<Settings>(KEYS.settings, DEFAULT_SETTINGS, () => ({ ...s }));
  }

  addHistory(t: Track): Promise<void> {
    return this.update<Track[]>(KEYS.history, [], (history) => pushHistory(history, structuredClone(t)));
  }

  async getHistory(limit: number): Promise<Track[]> {
    return structuredClone(((await this.kv.get<Track[]>(KEYS.history)) ?? []).slice(0, limit));
  }

  private update<T>(key: string, fallback: T, change: (value: T) => T): Promise<void> {
    const run = this.queue
      .catch(() => undefined)
      .then(async () => {
        const current = (await this.kv.get<T>(key)) ?? structuredClone(fallback);
        await this.kv.set(key, change(current));
      });
    this.queue = run;
    return run;
  }
}
```

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `pnpm --filter @breeze/web test`, then `pnpm typecheck`, then `pnpm lint:fix` and `pnpm lint`.
Expected: all PASS and clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): HTTP music source and IndexedDB storage" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: YouTube IFrame engine

**Files:**
- Create: `apps/web/src/youtube-api.ts`, `apps/web/src/iframe-engine.ts`
- Test: `apps/web/test/youtube-api.test.ts`, `apps/web/test/iframe-engine.test.ts`

**Interfaces:**
- Consumes: `AudioEngine`, `EngineEvents`, `Emitter` (`@breeze/ui/player`); `SourceError`, `Track`, `toSourceError` (`@breeze/core`).
- Produces:
  - `youtube-api.ts`:
    - `IFRAME_API_SRC`, `PLAYER_HOST`
    - `interface YTPlayer { cueVideoById(id); playVideo(); pauseVideo(); seekTo(s, allowSeekAhead); setVolume(0-100); getCurrentTime(); getDuration() }`
    - `interface PlayerEvents { onStateChange(state: number); onError(code: number); onAutoplayBlocked() }`
    - `type CreatePlayer = (container: HTMLElement, events: PlayerEvents) => Promise<YTPlayer>`
    - `createYouTubeLoader(doc?, win?): () => Promise<YTNamespace>`, which loads the script once and retries after a failure.
    - `createYouTubePlayer: CreatePlayer`
  - `iframe-engine.ts`:
    - `errorForCode(code: number): SourceError`. 100, 101 and 150 map to `not_found`, 153 to `blocked`, and anything else to `parse`.
    - `class IframeEngine implements AudioEngine { constructor(dock: HTMLElement, createPlayer?: CreatePlayer, timeoutMs?: number) }`
  - Engine behaviour:
    - `load()` cues the video and resolves on state CUED (5).
    - It rejects on an IFrame error during the load, or after `timeoutMs` (default 15 s).
    - A newer `load()` settles the older one quietly.
    - Player events other than CUED are ignored while a load is in flight.
    - PLAYING polls `time` every 500 ms.
    - `onAutoplayBlocked` emits `state: 'paused'`.
    - The dock is un-hidden on the first successful load.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/test/youtube-api.test.ts`:

```ts
import { SourceError } from '@breeze/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createYouTubeLoader, IFRAME_API_SRC } from '../src/youtube-api';

type FakeWin = Window & { YT?: { Player: unknown }; onYouTubeIframeAPIReady?: () => void };

const scripts = () => [...document.head.querySelectorAll(`script[src="${IFRAME_API_SRC}"]`)] as HTMLScriptElement[];

afterEach(() => {
  for (const s of scripts()) s.remove();
});

describe('createYouTubeLoader', () => {
  it('adds the script once and resolves when the API reports ready', async () => {
    const win = {} as FakeWin;
    const load = createYouTubeLoader(document, win);
    const a = load();
    const b = load();
    expect(scripts()).toHaveLength(1);
    win.YT = { Player: class {} };
    win.onYouTubeIframeAPIReady?.();
    expect(await a).toBe(win.YT);
    expect(await b).toBe(win.YT);
  });

  it('uses an already-loaded API without adding a script', async () => {
    const win = { YT: { Player: class {} } } as FakeWin;
    expect(await createYouTubeLoader(document, win)()).toBe(win.YT);
    expect(scripts()).toHaveLength(0);
  });

  it('rejects with a network SourceError when the script fails, and retries next time', async () => {
    const win = {} as FakeWin;
    const load = createYouTubeLoader(document, win);
    const first = load();
    scripts()[0]?.onerror?.(new Event('error'));
    const err = await first.catch((e) => e);
    expect(err).toBeInstanceOf(SourceError);
    expect(err.kind).toBe('network');
    expect(scripts()).toHaveLength(0);
    void load();
    expect(scripts()).toHaveLength(1);
  });
});
```

Create `apps/web/test/iframe-engine.test.ts`:

```ts
import { SourceError, type Track } from '@breeze/core';
import { describe, expect, it, vi } from 'vitest';
import { errorForCode, IframeEngine } from '../src/iframe-engine';
import type { CreatePlayer, PlayerEvents, YTPlayer } from '../src/youtube-api';

const t = (id: string): Track => ({ id, title: id, artists: [], thumbnails: [] });
const flush = () => new Promise((r) => setTimeout(r, 0));

class FakePlayer implements YTPlayer {
  cued: string[] = [];
  calls: string[] = [];
  volume = -1;
  time = 0;
  duration = 0;
  cueVideoById(id: string) {
    this.cued.push(id);
  }
  playVideo() {
    this.calls.push('play');
  }
  pauseVideo() {
    this.calls.push('pause');
  }
  seekTo(s: number) {
    this.calls.push(`seek:${s}`);
  }
  setVolume(v: number) {
    this.volume = v;
  }
  getCurrentTime() {
    return this.time;
  }
  getDuration() {
    return this.duration;
  }
}

function setup(createFails = 0) {
  const player = new FakePlayer();
  let events: PlayerEvents | undefined;
  let failures = createFails;
  const create = vi.fn<CreatePlayer>(async (_dock, ev) => {
    if (failures-- > 0) throw new Error('fetch failed');
    events = ev;
    return player;
  });
  const dock = { hidden: true } as HTMLElement;
  const engine = new IframeEngine(dock, create, 50);
  const seen = { states: [] as string[], errors: [] as unknown[], ended: 0, times: [] as unknown[] };
  engine.on('state', (s) => seen.states.push(s));
  engine.on('error', (e) => seen.errors.push(e));
  engine.on('ended', () => seen.ended++);
  engine.on('time', (x) => seen.times.push(x));
  const ev = () => events as PlayerEvents;
  async function loaded(id: string) {
    const p = engine.load(t(id));
    await flush();
    ev().onStateChange(5);
    await p;
  }
  return { player, ev, create, dock, engine, seen, loaded };
}

describe('errorForCode', () => {
  it.each([
    [100, 'not_found'],
    [101, 'not_found'],
    [150, 'not_found'],
    [153, 'blocked'],
    [2, 'parse'],
    [5, 'parse'],
  ])('maps %i to %s', (code, kind) => {
    const e = errorForCode(code);
    expect(e).toBeInstanceOf(SourceError);
    expect(e.kind).toBe(kind);
  });
});

describe('IframeEngine', () => {
  it('cues the track, shows the dock, applies volume, and creates the player once', async () => {
    const { player, create, dock, engine, seen, loaded } = setup();
    await loaded('a');
    expect(player.cued).toEqual(['a']);
    expect(dock.hidden).toBe(false);
    expect(player.volume).toBe(80);
    expect(seen.states[0]).toBe('loading');
    engine.setVolume(0.5);
    expect(player.volume).toBe(50);
    await loaded('b');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('rejects a load when the video cannot be embedded', async () => {
    const { ev, engine } = setup();
    const p = engine.load(t('a'));
    await flush();
    ev().onError(150);
    const err = await p.catch((e) => e);
    expect(err).toMatchObject({ kind: 'not_found' });
  });

  it('rejects a load that never gets cued', async () => {
    const { engine } = setup();
    const err = await engine.load(t('a')).catch((e) => e);
    expect(err).toMatchObject({ kind: 'network' });
  });

  it('settles a superseded load quietly and finishes the newer one', async () => {
    const { ev, engine } = setup();
    const first = engine.load(t('a'));
    await flush();
    const second = engine.load(t('b'));
    await flush();
    await expect(first).resolves.toBeUndefined();
    ev().onStateChange(5);
    await expect(second).resolves.toBeUndefined();
  });

  it('ignores player events from the old video while a new load is pending', async () => {
    const { ev, engine, seen, loaded } = setup();
    await loaded('a');
    const pending = engine.load(t('b'));
    await flush();
    ev().onStateChange(0);
    ev().onStateChange(1);
    ev().onError(101);
    expect(seen.ended).toBe(0);
    expect(seen.states).not.toContain('playing');
    await expect(pending).rejects.toMatchObject({ kind: 'not_found' });
    expect(seen.errors).toEqual([]);
  });

  it('maps playback states and polls time while playing', async () => {
    const { player, ev, seen, loaded } = setup();
    await loaded('a');
    vi.useFakeTimers();
    try {
      player.time = 12;
      player.duration = 200;
      ev().onStateChange(1);
      vi.advanceTimersByTime(500);
      expect(seen.states).toContain('playing');
      expect(seen.times).toEqual([{ position: 12, duration: 200 }]);
      ev().onStateChange(3);
      ev().onStateChange(2);
      vi.advanceTimersByTime(1500);
      expect(seen.times).toHaveLength(1);
      ev().onStateChange(0);
      expect(seen.states.slice(-2)).toEqual(['loading', 'paused']);
      expect(seen.ended).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports an error after a successful load as a playback error', async () => {
    const { ev, seen, loaded } = setup();
    await loaded('a');
    ev().onError(101);
    expect(seen.errors).toHaveLength(1);
    expect(seen.errors[0]).toMatchObject({ kind: 'not_found' });
  });

  it('turns a blocked autoplay into a paused state so the user can press Play', async () => {
    const { ev, seen, loaded } = setup();
    await loaded('a');
    ev().onAutoplayBlocked();
    expect(seen.states.at(-1)).toBe('paused');
  });

  it('forwards transport controls', async () => {
    const { player, engine, loaded } = setup();
    engine.play();
    expect(player.calls).toEqual([]);
    await loaded('a');
    engine.play();
    engine.pause();
    engine.seek(42);
    expect(player.calls).toEqual(['play', 'pause', 'seek:42']);
  });

  it('retries creating the player after a failure', async () => {
    const { create, engine, loaded } = setup(1);
    await expect(engine.load(t('a'))).rejects.toMatchObject({ kind: 'network' });
    await loaded('a');
    expect(create).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @breeze/web test youtube-api iframe-engine`
Expected: FAIL; the modules cannot be resolved.

- [ ] **Step 3: Implement**

Create `apps/web/src/youtube-api.ts`:

```ts
import { SourceError } from '@breeze/core';

export const IFRAME_API_SRC = 'https://www.youtube.com/iframe_api';
/** Privacy-enhanced player host: no YouTube cookies until the user plays. */
export const PLAYER_HOST = 'https://www.youtube-nocookie.com';

export interface YTPlayer {
  cueVideoById(videoId: string): void;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  /** 0..100 */
  setVolume(volume: number): void;
  getCurrentTime(): number;
  getDuration(): number;
}

export interface PlayerEvents {
  onStateChange(state: number): void;
  onError(code: number): void;
  onAutoplayBlocked(): void;
}

export type CreatePlayer = (container: HTMLElement, events: PlayerEvents) => Promise<YTPlayer>;

export interface YTNamespace {
  Player: new (element: HTMLElement, options: unknown) => YTPlayer;
}

type YTWindow = Window & { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void };

/** Load the IFrame API script once per page. If the script fails to load, the next call tries again. */
export function createYouTubeLoader(doc: Document = document, win: YTWindow = window): () => Promise<YTNamespace> {
  let pending: Promise<YTNamespace> | null = null;
  return () => {
    pending ??= new Promise<YTNamespace>((resolve, reject) => {
      if (win.YT?.Player) {
        resolve(win.YT);
        return;
      }
      const previous = win.onYouTubeIframeAPIReady;
      win.onYouTubeIframeAPIReady = () => {
        previous?.();
        if (win.YT) resolve(win.YT);
      };
      const script = doc.createElement('script');
      script.src = IFRAME_API_SRC;
      script.async = true;
      script.onerror = () => {
        pending = null;
        script.remove();
        reject(new SourceError('network', "Couldn't load the YouTube player."));
      };
      doc.head.append(script);
    });
    return pending;
  };
}

let defaultLoader: (() => Promise<YTNamespace>) | null = null;

export const createYouTubePlayer: CreatePlayer = async (container, events) => {
  defaultLoader ??= createYouTubeLoader();
  const YT = await defaultLoader();
  const target = document.createElement('div');
  container.append(target);
  return new Promise<YTPlayer>((resolve) => {
    const player = new YT.Player(target, {
      width: '100%',
      height: '100%',
      host: PLAYER_HOST,
      playerVars: { playsinline: 1, rel: 0 },
      events: {
        onReady: () => resolve(player),
        onStateChange: (e: { data: number }) => events.onStateChange(e.data),
        onError: (e: { data: number }) => events.onError(e.data),
        onAutoplayBlocked: () => events.onAutoplayBlocked(),
      },
    });
  });
};
```

Create `apps/web/src/iframe-engine.ts`:

```ts
import { SourceError, type Track, toSourceError } from '@breeze/core';
import { type AudioEngine, Emitter, type EngineEvents } from '@breeze/ui/player';
import { type CreatePlayer, createYouTubePlayer, type YTPlayer } from './youtube-api';

const STATE = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const;
const LOAD_TIMEOUT_MS = 15_000;
const POLL_MS = 500;

export function errorForCode(code: number): SourceError {
  switch (code) {
    case 100:
      return new SourceError('not_found', 'This track is no longer on YouTube.');
    case 101:
    case 150:
      return new SourceError('not_found', "This track can't be played outside YouTube.");
    case 153:
      return new SourceError('blocked', 'YouTube rejected the embedded player.');
    default:
      return new SourceError('parse', `YouTube player error ${code}.`);
  }
}

interface PendingLoad {
  token: number;
  done(error?: unknown): void;
}

/**
 * Plays tracks through the official YouTube IFrame player, shown in `dock`.
 * YouTube requires the player to stay visible at 200x200 px or more.
 */
export class IframeEngine implements AudioEngine {
  private readonly events = new Emitter<EngineEvents>();
  private playerPromise: Promise<YTPlayer> | null = null;
  private player: YTPlayer | null = null;
  private token = 0;
  private pending: PendingLoad | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private volume = 0.8;

  constructor(
    private readonly dock: HTMLElement,
    private readonly createPlayer: CreatePlayer = createYouTubePlayer,
    private readonly timeoutMs = LOAD_TIMEOUT_MS,
  ) {}

  async load(track: Track): Promise<void> {
    const token = ++this.token;
    this.pending?.done(); // an older load is superseded; let it settle quietly
    this.pending = null;
    this.stopPolling();
    this.events.emit('state', 'loading');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new SourceError('network', "The YouTube player didn't respond.")),
        this.timeoutMs,
      );
    });
    try {
      const player = await Promise.race([this.getPlayer(), timeout]);
      if (token !== this.token) return;
      this.dock.hidden = false;
      await Promise.race([
        new Promise<void>((resolve, reject) => {
          this.pending = { token, done: (error) => (error ? reject(error) : resolve()) };
          player.cueVideoById(track.id);
        }),
        timeout,
      ]);
    } finally {
      clearTimeout(timer);
      if (this.pending?.token === token) this.pending = null;
    }
  }

  play(): void {
    this.player?.playVideo();
  }

  pause(): void {
    this.player?.pauseVideo();
  }

  seek(seconds: number): void {
    this.player?.seekTo(seconds, true);
  }

  setVolume(v: number): void {
    this.volume = v;
    this.player?.setVolume(Math.round(v * 100));
  }

  on<K extends keyof EngineEvents>(event: K, cb: (payload: EngineEvents[K]) => void): () => void {
    return this.events.on(event, cb);
  }

  private getPlayer(): Promise<YTPlayer> {
    this.playerPromise ??= this.createPlayer(this.dock, {
      onStateChange: (state) => this.onState(state),
      onError: (code) => this.onError(code),
      onAutoplayBlocked: () => this.events.emit('state', 'paused'),
    }).then(
      (player) => {
        this.player = player;
        player.setVolume(Math.round(this.volume * 100));
        return player;
      },
      (e: unknown) => {
        this.playerPromise = null;
        throw toSourceError(e);
      },
    );
    return this.playerPromise;
  }

  private onState(state: number): void {
    if (this.pending) {
      // While a new video is being cued, only its CUED event matters.
      if (state === STATE.CUED) this.pending.done();
      return;
    }
    switch (state) {
      case STATE.PLAYING:
        this.startPolling();
        this.events.emit('state', 'playing');
        break;
      case STATE.PAUSED:
        this.stopPolling();
        this.events.emit('state', 'paused');
        break;
      case STATE.BUFFERING:
        this.events.emit('state', 'loading');
        break;
      case STATE.ENDED:
        this.stopPolling();
        this.events.emit('ended', undefined);
        break;
    }
  }

  private onError(code: number): void {
    const error = errorForCode(code);
    if (this.pending) {
      this.pending.done(error);
      return;
    }
    this.stopPolling();
    this.events.emit('error', error);
  }

  private startPolling(): void {
    this.stopPolling();
    this.poll = setInterval(() => {
      const p = this.player;
      if (p) this.events.emit('time', { position: p.getCurrentTime(), duration: p.getDuration() });
    }, POLL_MS);
  }

  private stopPolling(): void {
    if (this.poll) {
      clearInterval(this.poll);
      this.poll = null;
    }
  }
}
```

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `pnpm --filter @breeze/web test`, then `pnpm typecheck`, then `pnpm lint:fix` and `pnpm lint`.
Expected: all PASS and clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): YouTube IFrame audio engine" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Landing page, player bootstrap, dock, responsive layout

**Files:**
- Create: `apps/web/src/routes.ts`, `apps/web/src/player.tsx`, `apps/web/src/web.css`
- Create: `apps/web/src/landing/Landing.tsx`, `apps/web/src/landing/landing.css`, `apps/web/public/favicon.svg`
- Modify: `apps/web/src/main.tsx` (replace the placeholder), `packages/ui/src/styles.css` (append the responsive block)
- Test: `apps/web/test/routes.test.ts`, `apps/web/test/landing.test.tsx`

**Interfaces:**
- Consumes: `App`, `PlayerController` (`@breeze/ui`); `DEFAULT_SETTINGS` (`@breeze/core`); `HttpMusicSource`, `IdbStorage` (Task 3); `IframeEngine` (Task 4).
- Produces:
  - `isPlayerPath(pathname: string): boolean`, true for `/app`, `/app/…`.
  - `startPlayer(root: Root): Promise<void>`
  - `Landing()` and `REPO_URL`
  - The landing and player are split into separate chunks via dynamic `import()`, so the landing page does not download the player.

Design direction:
- **Same visual system as the app:** the slate background and cyan accent from `@breeze/ui/styles.css` tokens, and the Segoe UI or system font stack.
- **Landing layout:** a calm editorial page. A large balanced headline, one short paragraph, two clear actions, three plain feature cards, and a footer with the non-affiliation note.
- **Visual effect:** the only one is a faint accent-tinted radial wash behind the hero.
- **Honesty:** no fake screenshots and no invented stats.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/test/routes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isPlayerPath } from '../src/routes';

describe('isPlayerPath', () => {
  it.each([
    ['/app', true],
    ['/app/', true],
    ['/app/search', true],
    ['/', false],
    ['/apple', false],
    ['/application', false],
    ['/x/app', false],
  ])('%s -> %s', (path, expected) => {
    expect(isPlayerPath(path)).toBe(expected);
  });
});
```

Create `apps/web/test/landing.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Landing, REPO_URL } from '../src/landing/Landing';

describe('Landing', () => {
  it('leads with one headline and the two actions', () => {
    render(<Landing />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('link', { name: /open the web player/i }).getAttribute('href')).toBe('/app');
    const windows = screen.getByRole('link', { name: /windows app/i });
    expect(windows.getAttribute('href')).toBe(`${REPO_URL}/releases`);
    expect(windows.textContent).toMatch(/coming soon/i);
  });

  it('says Breeze is not affiliated with YouTube or Google', () => {
    render(<Landing />);
    expect(screen.getByRole('contentinfo').textContent).toMatch(/not affiliated with YouTube or Google/);
  });

  it('lists the three features', () => {
    render(<Landing />);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @breeze/web test routes landing`
Expected: FAIL; the modules cannot be resolved.

- [ ] **Step 3: Implement**

Create `apps/web/src/routes.ts`:

```ts
/** The web player lives under /app; everything else is the landing page. */
export const isPlayerPath = (pathname: string): boolean => /^\/app(?:\/|$)/.test(pathname);
```

Replace `apps/web/src/main.tsx`:

```tsx
import '@breeze/ui/styles.css';
import './web.css';
import { createRoot } from 'react-dom/client';
import { isPlayerPath } from './routes';

const root = createRoot(document.getElementById('root') as HTMLElement);

if (isPlayerPath(location.pathname)) {
  const { startPlayer } = await import('./player');
  await startPlayer(root);
} else {
  const { Landing } = await import('./landing/Landing');
  root.render(<Landing />);
}
```

Create `apps/web/src/player.tsx`:

```tsx
import { DEFAULT_SETTINGS } from '@breeze/core';
import { App, PlayerController } from '@breeze/ui';
import type { Root } from 'react-dom/client';
import { HttpMusicSource } from './http-source';
import { IdbStorage } from './idb-storage';
import { IframeEngine } from './iframe-engine';

export async function startPlayer(root: Root): Promise<void> {
  const source = new HttpMusicSource();
  const storage = new IdbStorage();
  // Private browsing can make IndexedDB unavailable; play on defaults instead of failing.
  const settings = await storage.getSettings().catch(() => DEFAULT_SETTINGS);
  const engine = new IframeEngine(document.getElementById('yt-dock') as HTMLElement);
  const player = new PlayerController({ engine, source, storage, autoplay: () => settings.autoplay }, settings.volume);
  root.render(<App player={player} services={{ source, storage }} />);
}
```

Create `apps/web/src/landing/Landing.tsx`:

```tsx
import { Download, Keyboard, type LucideIcon, Play, Search, ShieldCheck, Wind } from 'lucide-react';
import './landing.css';

export const REPO_URL = 'https://github.com/mrtheo-hub/Breeze-Music-Main';

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Search,
    title: 'Search and play',
    body: 'Find a song and it starts right away. When the queue runs out, Breeze keeps going with similar tracks.',
  },
  {
    icon: Keyboard,
    title: 'Media keys work',
    body: "Play, pause and skip from your keyboard or your system's media controls.",
  },
  {
    icon: ShieldCheck,
    title: 'No account',
    body: 'Nothing to sign up for. Your listening history stays in your browser.',
  },
];

export function Landing() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <span className="brand">
          <Wind size={22} aria-hidden="true" />
          Breeze
        </span>
        <a className="landing-link" href={REPO_URL}>
          Source code
        </a>
      </header>
      <main className="landing-main">
        <section className="hero" aria-labelledby="hero-title">
          <h1 id="hero-title">YouTube Music, without the clutter.</h1>
          <p className="hero-sub">
            Breeze is a free, open-source music player for YouTube Music. Use it in your browser today. A Windows app is
            on the way.
          </p>
          <div className="hero-actions">
            <a className="cta cta-primary" href="/app">
              <Play size={18} aria-hidden="true" />
              Open the web player
            </a>
            <a className="cta" href={`${REPO_URL}/releases`}>
              <Download size={18} aria-hidden="true" />
              Windows app (coming soon)
            </a>
          </div>
        </section>
        <section className="features" aria-labelledby="features-title">
          <h2 id="features-title" className="visually-hidden">
            Features
          </h2>
          <ul>
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <li key={title}>
                <Icon size={22} aria-hidden="true" />
                <h3>{title}</h3>
                <p>{body}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <footer className="landing-footer">
        <p>Breeze is not affiliated with YouTube or Google. Music and artwork come from YouTube Music.</p>
      </footer>
    </div>
  );
}
```

Create `apps/web/src/landing/landing.css`:

```css
.landing {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  background:
    radial-gradient(1200px 600px at 10% -10%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 60%),
    var(--bg);
}

.landing-nav,
.landing-main,
.landing-footer {
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
  padding-inline: 24px;
}

.landing-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-block: 20px;
}

.landing-nav .brand {
  padding: 0;
}

.landing-link {
  color: var(--text-muted);
  text-decoration: none;
}

.landing-link:hover {
  color: var(--text);
}

.landing-main {
  flex: 1;
}

.hero {
  max-width: 720px;
  padding: 96px 0 72px;
}

.hero h1 {
  margin: 0 0 20px;
  font-size: clamp(36px, 6vw, 60px);
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -0.03em;
  text-wrap: balance;
}

.hero-sub {
  max-width: 560px;
  margin: 0 0 32px;
  color: var(--text-muted);
  font-size: 18px;
  line-height: 1.55;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.cta {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text);
  font-weight: 600;
  text-decoration: none;
}

.cta:hover {
  border-color: var(--accent);
}

.cta-primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--bg);
}

.cta-primary:hover {
  filter: brightness(1.08);
}

.features ul {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
  margin: 0;
  padding: 0 0 96px;
  list-style: none;
}

.features li {
  padding: 24px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
}

.features svg {
  color: var(--accent);
}

.features h3 {
  margin: 14px 0 6px;
  font-size: 16px;
}

.features p {
  margin: 0;
  color: var(--text-muted);
}

.landing-footer {
  padding-block: 24px;
  border-top: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 13px;
}

.landing-footer p {
  margin: 0;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 600px) {
  .hero {
    padding: 56px 0 48px;
  }

  .hero-sub {
    font-size: 16px;
  }

  .cta {
    justify-content: center;
    width: 100%;
  }
}
```

Create `apps/web/src/web.css`:

```css
/* The YouTube player must stay visible at >= 200x200 px while a track is loaded. */
.yt-dock {
  position: fixed;
  right: 16px;
  bottom: calc(var(--player-h) + 16px);
  z-index: 10;
  width: 224px;
  height: 224px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface-2);
  box-shadow: var(--shadow);
}

.yt-dock[hidden] {
  display: none;
}

.yt-dock iframe {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
}

@media (max-width: 760px) {
  .yt-dock {
    right: 12px;
    bottom: 140px;
    width: 200px;
    height: 200px;
  }
}
```

Create `apps/web/public/favicon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#0e1116"/><path d="M7 12h12a4 4 0 1 0-4-4M7 17h17a4 4 0 1 1-4 4M7 22h8" fill="none" stroke="#5cc8d6" stroke-width="2.5" stroke-linecap="round"/></svg>
```

Append to `packages/ui/src/styles.css`. This is the narrow-screen layout for the web player; the desktop window is never narrower than 880 px:

```css
@media (max-width: 760px) {
  .app {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr auto;
  }

  .sidebar {
    flex-direction: row;
    align-items: center;
    padding: 8px 12px;
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }

  .brand {
    margin-right: auto;
    padding: 0 8px 0 0;
    font-size: 16px;
  }

  .content {
    padding: 20px 16px 32px;
  }

  .track-grid {
    grid-template-columns: 1fr;
  }

  .player-bar {
    grid-template-columns: 1fr;
    gap: 6px;
    padding: 8px 12px 10px;
  }

  .volume {
    display: none;
  }
}
```

- [ ] **Step 4: Run tests, typecheck, lint, build**

Run: `pnpm --filter @breeze/web test`, then `pnpm test`, `pnpm typecheck`, `pnpm lint:fix` and `pnpm lint`, then `pnpm --filter @breeze/web build:vercel`.
Expected: all PASS and clean; the build writes `.vercel/output`.

Then run: `grep -rl "youtubei" apps/web/dist || echo "browser bundle clean"`
Expected: `browser bundle clean`.

Then run: `ls apps/web/dist/assets`
Expected: separate JS chunks exist for the landing page and the player.

- [ ] **Step 5: Check it by eye**

Run: `pnpm dev:web`. Open the printed local URL at desktop width (1280 px) and at phone width (375 px), and check each item:
1. `/` shows the landing page: one headline, two buttons, and three feature cards. Nothing overflows sideways at 375 px.
2. "Open the web player" goes to `/app`, which shows the Breeze player with Home loading and then songs or an empty or error state.
3. Search `daft punk` and click a song. The dock appears bottom-right (at least 200×200) and plays the track. The player bar shows the title and the seek bar moves.
4. At 375 px, the sidebar is a top bar, the player bar stacks, and nothing overlaps the transport buttons.
5. The browser console shows no errors.

Fix anything that fails here (adding a unit test where possible) before committing.

- [ ] **Step 6: Commit**

```bash
git add apps/web packages/ui/src/styles.css
git commit -m "feat(web): landing page, web player bootstrap and responsive layout" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Vercel project config, CI, deploy guide

**Files:**
- Create: `apps/web/vercel.json`, `docs/deploy-vercel.md`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: the `build:vercel` script (Task 2).
- Produces: Vercel settings that a dashboard import picks up, a CI build check, and the user's deploy steps.

- [ ] **Step 1: Vercel config**

Create `apps/web/vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": null,
  "installCommand": "npx -y pnpm@10.34.9 install --frozen-lockfile --filter @breeze/web...",
  "buildCommand": "npx -y pnpm@10.34.9 run build:vercel"
}
```

There are two reasons for these commands:
- The pnpm version is pinned because `pnpm-workspace.yaml` uses pnpm 10 settings (`overrides`, `onlyBuiltDependencies`).
- The filtered install skips Electron and the desktop app.

- [ ] **Step 2: CI**

In `.github/workflows/ci.yml`, after the `pnpm test` step, add:

```yaml
- run: pnpm --filter @breeze/web build:vercel
- name: No youtubei.js in the browser bundle
  run: |
    if grep -rl "youtubei" apps/web/dist; then
      echo "youtubei.js leaked into the browser bundle"
      exit 1
    fi
```

Run: `pnpm lint:fix` and `pnpm lint`.
Expected: clean. Biome also formats YAML.

- [ ] **Step 3: Deploy guide**

Create `docs/deploy-vercel.md`:

```markdown
# Deploying the Breeze website to Vercel

The site in `apps/web` builds to Vercel's Build Output API itself, so no framework preset is needed.

## One-time setup

1. On vercel.com choose **Add New → Project** and import `mrtheo-hub/Breeze-Music-Main`.
2. Next to **Root Directory**, choose **Edit** and pick `apps/web`. Leave "Include files outside the root directory" enabled.
3. Set **Framework Preset** to **Other**. Leave the build, output and install overrides off; `apps/web/vercel.json` provides them.
4. Choose **Deploy**.

After that, every push to `main` deploys to production and every other branch gets a preview URL.

## Check a deployment

- `https://<project>.vercel.app/` shows the landing page.
- `https://<project>.vercel.app/app` shows the web player.
- `https://<project>.vercel.app/api/search?q=daft%20punk&filter=songs` returns JSON with a `songs` array.

If `/api/*` answers `503` with `"error":"blocked"`, YouTube is rate-limiting Vercel's servers for now. The web player shows "YouTube is limiting requests" and recovers on its own.

## Local

- `pnpm dev:web` runs the site and the API together at http://localhost:5173.
- `pnpm --filter @breeze/web build:vercel` writes `apps/web/.vercel/output`.
- `pnpm --filter @breeze/web smoke:api -- --bundle` calls the built function against live YouTube Music.
```

- [ ] **Step 4: Verify everything**

Run: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm --filter @breeze/web build:vercel`, then `pnpm --filter @breeze/web smoke:api -- --bundle`.
Expected:
- All are clean, and every package passes.
- The bundle smoke prints 200 for home and search and 400 for the bad id.

- [ ] **Step 5: Commit and push**

```bash
git add apps/web/vercel.json docs/deploy-vercel.md .github/workflows/ci.yml
git commit -m "chore(web): Vercel config, CI build check and deploy guide" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

Expected: the push succeeds and CI is green.

The Vercel import is the user's step, since it needs their Vercel login; follow `docs/deploy-vercel.md`. After the first deploy, check the three URLs in "Check a deployment".
