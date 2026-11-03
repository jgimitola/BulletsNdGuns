# Levels in the Database Implementation Plan (stage 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levels live in the database behind a swappable store, with an HTTP API to list, read, create, update, publish, unpublish, duplicate and delete them. Rooms play a playlist of 1..10 levels the creator picks in a level browser inside the create-room dialog.

**Architecture:**
- **Storage:** our own Kysely migration creates a `level` table in the stage 2 SQLite database. A `LevelStore` interface hides Kysely; a `LevelService` above it owns visibility, ownership and limits. The HTTP routes and the socket gateway only talk to the service.
- **Built-in levels:** the three classics are upserted on every start, with ids equal to their slugs.
- **Room creation:** it now loads the chosen levels through the service. The room keeps its own copies, so later edits never reach it.
- **Client:** the create-room dialog gets the approved picker: playlist chips, search, ALL/MINE tabs and thumbnail rows.

**Tech Stack:** Kysely 0.29 on `node:sqlite` (stage 2's `Database`), Express 5, Zod 4 (shared schemas), Socket.io 4, React 19, TanStack Query 5, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-03-levels-and-accounts-design.md`. In scope: the Storage layer, Matches and rooms, Level browser and HTTP API sections, plus "Decisions settled after review". Stage 3 of its build order. The editor and My levels screen are stage 4; this plan builds the API they will call.

## Global Constraints

- Storage specifics (Kysely, SQL) stay inside `packages/server/src/db/` and `packages/server/src/levels/kysely-level-store.ts`. The service, routes, gateway and rooms see only `LevelStore`.
- Untrusted input is validated with Zod schemas in `@bng/shared`, wrapped in `parse*` functions that return `null` (stage 2 pattern).
- Code in English. Every player-facing string goes through i18n in both `es` and `en`.
- Level names follow room-name rules: 1..24 characters (`labelSchema(24)`).
- Playlist length 1..10 (`MAX_PLAYLIST_LENGTH = 10`). The default playlist is the three classics: `classic-1`, `classic-2`, `classic-3`.
- Built-in levels: `builtin = true`, no author, always published, shown as by `RESERVED_NICKNAME` ("BulletsNdGuns"), editable by nobody, upserted from `CLASSIC_LEVELS` on every start (code is their source of truth).
- **Visibility:** a level is visible to a viewer when it is published, or when the viewer is its author.
- **Changing a level:** only its author can update, publish, unpublish or delete it.
- **Duplicating:** a signed-in player can duplicate any visible level.
- **Playable:** a level is publishable and playlist-eligible only when `isPlayable(data)` is true (both spawns and the portal).
- **Saving a published level:** refused while the new data isn't playable (spec, option (a)).
- **Running rooms:** they keep the levels they loaded. Edits, unpublishing and deletes after creation never reach them.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Run `npx prettier --write --end-of-line auto <files>` before each commit; the working copy is CRLF and a plain `--check` reports every file.

## Review Focus

1. **Search text containing LIKE wildcards** (`%`, `_`, `\`) matches those characters literally, not as patterns. (Test in Task 2.)
2. **A level deleted or unpublished between the browser listing it and `createRoom`.** The request is refused with `levelUnavailable`, no room is created, and the player stays roomless. (Test in Task 4.)
3. **The creator disconnects while `createRoom` is waiting on the database.** No room is left behind. (Test in Task 4.)
4. **A level edited after a room was created.** That room's match still plays the old data. (Test in Task 4.)
5. **A row whose stored `data` no longer parses** (a manual edit or a future format) is skipped in lists and reads as not found. It never crashes the listing. (Test in Task 2.)

---

### Task 1: Shared level protocol

**Files:**
- Create: `packages/shared/src/protocol/levels.ts` (and export it from `src/index.ts`)
- Modify: `packages/shared/src/protocol/rooms.ts`
- Test: `packages/shared/test/levels-protocol.test.ts`, `packages/shared/test/rooms.test.ts`

**Interfaces:**
- Produces, in `levels.ts`:

```ts
export const LEVEL_NAME_MAX_LENGTH = 24;
export const MAX_PLAYLIST_LENGTH = 10;
export const LEVELS_PAGE_SIZE = 20;
export const DEFAULT_PLAYLIST: readonly string[] = CLASSIC_LEVELS.map((l) => l.slug);
export type LevelId = string;
export const levelIdSchema; // z.string().min(1).max(64)
export const levelNameSchema; // labelSchema(LEVEL_NAME_MAX_LENGTH): export labelSchema from rooms.ts for this
export interface LevelWrite { name: string; data: LevelData }
export const levelWriteSchema; export function parseLevelWrite(raw: unknown): LevelWrite | null;
export interface LevelQuery { search: string; mine: boolean; offset: number }
export const levelQuerySchema; export function parseLevelQuery(raw: unknown): LevelQuery | null;
/** One row of the level browser. `tiles` is the 500 tile characters of tilesToRows, joined. */
export interface LevelSummary {
  id: LevelId; name: string; author: string; builtin: boolean; published: boolean;
  playable: boolean; updatedAt: string; tiles: string;
}
export interface LevelPage { levels: LevelSummary[]; nextOffset: number | null }
export interface LevelDetail extends Omit<LevelSummary, 'tiles'> { data: LevelData }
export type LevelError = 'invalid' | 'signInRequired' | 'notFound' | 'forbidden' | 'notPublishable' | 'tooManyLevels' | 'levelUnavailable';
```

  - `levelQuerySchema` reads the query string. `search` is a trimmed string of at most 40 characters, default `''`. `mine` is `'1'` for true and anything else, or absent, for false. `offset` is coerced to an integer in 0..10000, default 0.
- Produces, in `rooms.ts`:
  - `CreateRoomRequest` gains `levelIds?: LevelId[]` (1..`MAX_PLAYLIST_LENGTH` items, duplicates allowed). When the field is absent, the server uses `DEFAULT_PLAYLIST`.
  - `RoomError` gains `'levelUnavailable'`.

- [ ] **Step 1: Write the failing tests.**
  - `parseLevelWrite({ name: ' Torre ', data: <valid draft>, extra: 1 })` returns `{ name: 'Torre', data }`. It returns null for a 25-character name and for invalid data.
  - `parseLevelQuery({})` is `{ search: '', mine: false, offset: 0 }`. `parseLevelQuery({ search: ' ab ', mine: '1', offset: '40' })` is `{ search: 'ab', mine: true, offset: 40 }`. It returns null for `offset: '-1'`, `offset: '10001'` and a 41-character search.
  - `DEFAULT_PLAYLIST` equals `['classic-1', 'classic-2', 'classic-3']`.
  - `parseCreateRoom({ name: 'Sala', levelIds: ['a', 'a'] })` keeps both ids. `parseCreateRoom({ name: 'Sala' })` has no `levelIds`. It returns null for `levelIds: []`, for 11 ids, and for `levelIds: [3]`.
- [ ] **Step 2: Run it.** `npx vitest run packages/shared`. Expected: FAIL, because the module is missing.
- [ ] **Step 3: Implement** `levels.ts` and the `rooms.ts` changes.
- [ ] **Step 4: Verify.** `npm test`, `npm run typecheck` and `npm run lint` all pass.
- [ ] **Step 5: Commit** `feat(shared): level protocol and playlists in createRoom`.

---

### Task 2: Level table, migrations and the Kysely level store

**Files:**
- Create: `packages/server/src/db/migrations.ts`, `packages/server/src/levels/level-store.ts` (interface and types), `packages/server/src/levels/kysely-level-store.ts`
- Test: `packages/server/test/level-store.test.ts`

**Interfaces:**
- Consumes: `Database` and `createAuth` (stage 2); `CLASSIC_LEVELS`, `BuiltinLevel`, `parseLevelData` and `nicknameKey` (shared).
- Produces:

```ts
// level-store.ts
export interface LevelRecord {
  id: LevelId; name: string; authorId: string | null; authorNickname: string | null;
  builtin: boolean; published: boolean; data: LevelData; createdAt: number; updatedAt: number; // ms epoch
}
export interface LevelListFilter {
  viewerId: string | null; mineOnly: boolean; search: string; offset: number; limit: number;
}
export interface LevelStore {
  list(filter: LevelListFilter): Promise<LevelRecord[]>;
  get(id: LevelId): Promise<LevelRecord | null>;
  countByAuthor(authorId: string): Promise<number>;
  create(authorId: string, write: LevelWrite): Promise<LevelRecord>;
  update(id: LevelId, write: LevelWrite): Promise<LevelRecord | null>;
  setPublished(id: LevelId, published: boolean): Promise<void>;
  delete(id: LevelId): Promise<void>;
  upsertBuiltin(level: BuiltinLevel): Promise<void>;
}
// migrations.ts
export async function migrateGameTables(db: Database): Promise<void>; // Kysely Migrator, in-code provider
// kysely-level-store.ts
export function kyselyLevelStore(db: Database, now?: () => number): LevelStore;
```

Table `level`, created by migration `2026-11-03-level`:

| Column | Type |
|---|---|
| `id` | text, primary key |
| `name` | text, not null |
| `name_key` | text, not null; `nicknameKey(name)`, used for search |
| `author_id` | text, nullable |
| `builtin` | integer 0/1 |
| `published` | integer 0/1 |
| `data` | text; `LevelData` as JSON |
| `created_at`, `updated_at` | integer, ms |

Indexes on `author_id` and `published`. There is no foreign key: SQLite doesn't enforce them by default, and accounts can't be deleted.

How the store behaves:
- **New ids** come from `randomUUID()`. Built-in ids are their slugs.
- **`list`** returns the rows visible to the viewer (published, or `author_id = viewerId`). With `mineOnly`, it returns only `author_id = viewerId`, and nothing when there is no viewer.
  - **Search:** `search` is matched with `LIKE '%term%' ESCAPE '\'` against `name_key` or the author's key. The term is `nicknameKey(search)` with `\`, `%` and `_` escaped. The author's key is `user.username` from a left join, or `'bulletsndguns'` for built-ins.
  - **Order:** built-ins first by id, then `updated_at` descending, then `id`.
  - **Paging:** `limit` and `offset`.
  - **Author:** `authorNickname` is `user.displayUsername`.
- **Bad data:** a row whose `data` fails `parseLevelData` is skipped by `list` and reads as null from `get` (Review Focus 5).
- **`upsertBuiltin`** inserts the built-in, or updates its `name`, `name_key` and `data` and leaves `updated_at` alone, with `published = 1`.
- **`update`** sets `updated_at = now()`. It returns null for a missing id.

- [ ] **Step 1: Write the failing tests** (`level-store.test.ts`). Setup: an in-memory database, `createAuth` to create the user tables, two accounts registered through `auth.api.signUpEmail` (Ana, Beto), `migrateGameTables`, and a store with a fake clock.
  1. `migrateGameTables` run twice is a no-op the second time.
  2. After upserting the three `CLASSIC_LEVELS`, `list` for a guest returns `classic-1..3` first, as built-ins with `authorNickname` null, and `get('classic-2').data` equals `CLASSIC_LEVELS[1].data`.
  3. Upserting a built-in again with changed data updates `data` and keeps `updated_at`.
  4. Ana's draft:
     - it is listed for Ana, not for Beto or a guest;
     - with `mineOnly`, Ana sees it and Beto sees nothing of Ana's;
     - after `setPublished(true)`, Beto sees it.
  5. Search finds levels by name case-insensitively (`'TORRE'` finds "Torre"). Searching `'ana'` finds Ana's levels by author. Searching `'bullets'` finds the built-ins.
  6. Searching `'50%'` finds only the level literally named "50% off", not "500 off". `'a_c'` doesn't match "abc" (Review Focus 1).
  7. `offset` and `limit` page through 25 levels in a stable order.
  8. `update` changes the name and data and bumps `updatedAt` to the clock. `update` of a missing id returns null.
  9. `delete` removes the row.
  10. `countByAuthor` counts only that author's levels.
  11. A row whose `data` is set to `'{"cols":3}'` through raw Kysely is skipped by `list`, and `get` returns null for it (Review Focus 5).
- [ ] **Step 2: Run it.** `npx vitest run packages/server/test/level-store.test.ts`. Expected: FAIL, because the modules are missing.
- [ ] **Step 3: Implement** `migrations.ts`, `level-store.ts` and `kysely-level-store.ts`.
- [ ] **Step 4: Verify.** The file passes, then `npm test`, typecheck and lint.
- [ ] **Step 5: Commit** `feat(server): level table and Kysely level store`.

---

### Task 3: Level service and the HTTP API

**Files:**
- Create: `packages/server/src/levels/level-service.ts`, `packages/server/src/http/levels-routes.ts`, `packages/server/src/net/rate-limiter.ts` (move `rateLimiter` out of `socket-gateway.ts` and import it back)
- Modify: `packages/server/src/http/create-app.ts`, `packages/server/src/index.ts`
- Test: `packages/server/test/level-service.test.ts`, `packages/server/test/server.integration.test.ts`

**Interfaces:**
- Consumes: `LevelStore` (Task 2), the shared types from Task 1, and `Auth.sessionAccount` (stage 2).
- Produces:

```ts
export type ServiceResult<T> = { ok: true; value: T } | { ok: false; error: LevelError };
export const MAX_LEVELS_PER_ACCOUNT = 100;
export class LevelService {
  constructor(store: LevelStore);
  /** Upserts CLASSIC_LEVELS; called on server start. */
  seedBuiltins(): Promise<void>;
  list(viewerId: string | null, query: LevelQuery): Promise<LevelPage>;
  get(viewerId: string | null, id: LevelId): Promise<ServiceResult<LevelDetail>>;
  create(authorId: string, write: LevelWrite): Promise<ServiceResult<LevelDetail>>;
  update(authorId: string, id: LevelId, write: LevelWrite): Promise<ServiceResult<LevelDetail>>;
  setPublished(authorId: string, id: LevelId, published: boolean): Promise<ServiceResult<LevelDetail>>;
  delete(authorId: string, id: LevelId): Promise<ServiceResult<null>>;
  duplicate(authorId: string, id: LevelId): Promise<ServiceResult<LevelDetail>>;
  /** Levels for a room, in order, as copies; any missing, invisible or unplayable id fails the lot. */
  loadPlaylist(viewerId: string, ids: readonly LevelId[]): Promise<ServiceResult<PlaylistLevel[]>>;
}
export interface PlaylistLevel { name: string; level: Level } // Level = buildLevel(data)
export function levelsRouter(service: LevelService, sessionAccount: Auth['sessionAccount']): express.Router;
```

Service rules:
- **Visibility and ownership** follow Global Constraints. An invisible level is `notFound`, never `forbidden`, so drafts don't leak that they exist. A visible level that isn't the caller's is `forbidden` for every mutation, built-ins included.
- **`create`** fails with `tooManyLevels` once the author has `MAX_LEVELS_PER_ACCOUNT` levels. New levels are drafts (unpublished).
- **`update`** of a published level with unplayable data is `notPublishable`, and so is `setPublished(true)` on an unplayable level.
- **`duplicate`** copies the name and data into a new draft owned by the caller. It counts against the cap.
- **`list`** fetches `LEVELS_PAGE_SIZE + 1` rows to compute `nextOffset`, and maps each row to a `LevelSummary`:
  - `author` is the nickname, or `RESERVED_NICKNAME` for built-ins;
  - `updatedAt` is ISO;
  - `tiles` is `tilesToRows(data.tiles).join('')`;
  - `playable` is `isPlayable(data)`.
- **`loadPlaylist`** fails with `levelUnavailable`, which the gateway answers as the `RoomError` of the same name.

HTTP routes, mounted at `/api/levels` before the `/api` 404, using `express.json({ limit: '32kb' })`:

| Route | Success | Notes |
|---|---|---|
| `GET /` | `200 { levels, nextOffset }` | Guests get published levels; `mine=1` gives them an empty page |
| `GET /:id` | `200 { level }` | |
| `POST /` | `201 { level }` | |
| `PUT /:id` | `200 { level }` | |
| `DELETE /:id` | `204` | |
| `POST /:id/publish`, `POST /:id/unpublish` | `200 { level }` | |
| `POST /:id/duplicate` | `201 { level }` | |

- **Mutations** need a session (`401 { error: 'signInRequired' }`) and are rate-limited per account at 20 per 60 s (`429 { error: 'rateLimited' }`), using the moved `rateLimiter`.
- **Error statuses:** `invalid` 400, `notFound` 404, `forbidden` 403, `notPublishable` 409, `tooManyLevels` 409.
- **Responses** are `Cache-Control: no-store`.

`startServer` builds the store and service after `createAuth`, runs `migrateGameTables` and `seedBuiltins`, and mounts the router.

- [ ] **Step 1: Write the failing service tests**, using a real in-memory store as in Task 2.
  - Ana creates a draft. Beto's `get` is `notFound`, a guest's `get` is `notFound`, and Ana's `get` is ok.
  - Ana publishes a playable level. Beto's `get` is ok, Beto's `update` is `forbidden`, and Beto's `delete` is `forbidden`.
  - Ana's `update` of `classic-1` is `forbidden`.
  - Publishing a draft with no portal is `notPublishable`.
  - Updating a published level to data without a right spawn is `notPublishable`, and the stored level is unchanged.
  - `create` beyond `MAX_LEVELS_PER_ACCOUNT` is `tooManyLevels`. Use a store with 100 seeded rows.
  - Beto duplicates Ana's published level: a new id, author Beto, a draft, the same data. Duplicating Ana's draft is `notFound`.
  - `list` gives the summary shapes: the `tiles` string has length 500, a built-in's author is `'BulletsNdGuns'`, and `nextOffset` is 20 when there are 21 or more levels and null otherwise.
  - `loadPlaylist`:
    - `['classic-1', 'classic-1']` gives two entries named "Classic 1";
    - Ana's own playable draft is ok for Ana;
    - Ana's draft for Beto is `levelUnavailable`;
    - an unplayable level is `levelUnavailable`;
    - a missing id is `levelUnavailable`.
- [ ] **Step 2: Write the failing HTTP integration tests** in `server.integration.test.ts`, describe `'levels API'`.
  - `GET /api/levels` lists the three classics first.
  - A guest's `POST` gets 401.
  - A registered user's full round trip: `POST` 201, `PUT` 200, `publish` 200, another account's `GET` 200, another account's `PUT` 403, `DELETE` 204, then `GET` 404.
  - A body over 32 KB gets 413.
  - Invalid data gets 400 `{ error: 'invalid' }`.
  - The 21st write within a minute gets 429.
- [ ] **Step 3: Run them.** Expected: FAIL.
- [ ] **Step 4: Implement** the service, router, rate-limiter move and wiring.
- [ ] **Step 5: Verify.** Everything is green, and typecheck and lint pass.
- [ ] **Step 6: Commit** `feat(server): level service and HTTP API`.

---

### Task 4: Rooms play playlists

**Files:**
- Modify: `packages/shared/src/protocol/rooms.ts` (`RoomSummary.levels: string[]`, `RoomLobby.levels: string[]`)
- Modify: `packages/server/src/rooms/room.ts`, `room-manager.ts`, `packages/server/src/net/socket-gateway.ts`, `packages/server/src/index.ts`
- Test: `packages/server/test/room.test.ts`, `packages/server/test/server.integration.test.ts`

**Interfaces:**
- Consumes: `LevelService.loadPlaylist` and `PlaylistLevel` (Task 3), and `CreateRoomRequest.levelIds` and `DEFAULT_PLAYLIST` (Task 1).
- Produces:
  - `RoomOptions.playlist: readonly PlaylistLevel[]`, which replaces `Level[]`. The room uses `entry.level` to play and `entry.name` for its `levels`.
  - `summary()` and `lobby()` include `levels: string[]`, the names in order.
  - `RoomFactory(options: Pick<RoomOptions, 'id' | 'name' | 'playlist' | 'onClosed'>)`.
  - `RoomManager.create(playerId, name, nickname, playlist: readonly PlaylistLevel[]): RoomResult`.
  - `GatewayDeps` adds `loadPlaylist(accountId: string, ids: readonly LevelId[]): Promise<ServiceResult<PlaylistLevel[]>>`.

Gateway `createRoom`:
1. Validate, require an account, and fail fast with `alreadyInRoom`.
2. Await `loadPlaylist(account.id, request.levelIds ?? DEFAULT_PLAYLIST)`. A failure answers `levelUnavailable`.
3. If the socket has disconnected meanwhile, do nothing (Review Focus 3).
4. Otherwise call `rooms.create`, which re-checks `alreadyInRoom`.
5. Answer the ack.

- [ ] **Step 1: Update `room.test.ts`.**
  - The `setup` and `startMatch` helpers wrap levels as `PlaylistLevel` with names `L1`, `L2` and so on.
  - Add: `summary().levels` and `lobby().levels` list the playlist names in order.
  - Every existing room test keeps passing with only the helper change.
- [ ] **Step 2: Write the failing integration tests** (describe `'rooms with playlists'`):
  1. `createRoom` with no `levelIds` gives a lobby whose `levels` are `['Classic 1', 'Classic 2', 'Classic 3']`, and `GET /api/rooms` shows the same.
  2. Ana creates a playable draft over HTTP, then a room with `levelIds: [draftId]`. Once both players are ready, `levelStarted.level` equals the draft's data. (A one-level match ending at its portal is already covered by `room.test.ts` since stage 1.)
  3. Beto's `createRoom` with Ana's draft id gets `levelUnavailable`, and Beto stays roomless (a following `createRoom` with no ids succeeds).
  4. Ana publishes a level and lists it. Ana deletes it, then `createRoom` with its id gets `levelUnavailable`, and `GET /api/rooms` is empty (Review Focus 2).
  5. Ana creates a room with her level, then `PUT`s new data for that level. Two players ready up, and `levelStarted.level` still equals the old data (Review Focus 4).
  6. A client emits `createRoom` and disconnects at once. `GET /api/rooms` polls to `[]` (Review Focus 3).
- [ ] **Step 3: Run them.** Expected: the new tests FAIL.
- [ ] **Step 4: Implement** the room, manager, gateway and index wiring. `startServer`'s factory receives the playlist from the gateway.
- [ ] **Step 5: Verify.** Everything is green, and typecheck and lint pass. The client still compiles; `levels` is an extra field it ignores until Task 6.
- [ ] **Step 6: Commit** `feat: rooms play a playlist of levels from the database`.

---

### Task 5: Client levels API, playlist model and helpers

**Files:**
- Create: `packages/client/src/net/levels-api.ts`, `packages/client/src/ui/level-picker/playlist.ts`, `packages/client/src/ui/level-picker/thumbnail.ts`, `packages/client/src/ui/level-picker/updated-label.ts`
- Modify: `packages/client/src/net/network-client.ts`, `packages/client/src/ui/store.ts`, `packages/client/src/main.ts`
- Test: `packages/client/test/playlist.test.ts`, `packages/client/test/thumbnail.test.ts`, `packages/client/test/updated-label.test.ts`, `packages/client/test/ui-store.test.ts`

**Interfaces:**
- Consumes: `LevelPage`, `LevelSummary`, `MAX_PLAYLIST_LENGTH`, `DEFAULT_PLAYLIST` and `CLASSIC_LEVELS` (shared).
- Produces:

```ts
// levels-api.ts
export const LEVELS_QUERY_KEY = ['levels'] as const;
export function fetchLevels(query: { search: string; mine: boolean; offset: number }, signal?: AbortSignal): Promise<LevelPage>;
// playlist.ts: pure, immutable
export interface PlaylistItem { id: string; name: string }
export const defaultPlaylist: () => PlaylistItem[]; // the classics with their names
export function toggleLevel(list: readonly PlaylistItem[], item: PlaylistItem): PlaylistItem[]; // remove all of id if present, else append if < MAX
export function removeAt(list: readonly PlaylistItem[], index: number): PlaylistItem[];
export function moveItem(list: readonly PlaylistItem[], from: number, to: number): PlaylistItem[];
// thumbnail.ts
/** Source rect of tile id 1..8 in level-tiles.png (128 x 60: 4 columns, 2 rows of 32 x 30). */
export function tileSource(id: number): { x: number; y: number; width: 32; height: 30 };
export function tileIdAt(tiles: string, index: number): number; // '.12345678' -> 0..8
// updated-label.ts
export function updatedLabel(updatedAt: string, now: number, locale: Locale): string; // Intl.RelativeTimeFormat, days, numeric: 'auto'
```

- `UiActions.createRoom(name: string, levelIds: string[])`. The store's `createRoom(name, levelIds)` passes the ids through, and `NetworkClient.createRoom(name, levelIds)` sends `{ name, levelIds }`.

- [ ] **Step 1: Write the failing tests.**
  - `toggleLevel` adds a level, removes it on a second toggle, and returns the list unchanged at 10 items.
  - `moveItem([a, b, c], 0, 2)` gives `[b, c, a]`, and out-of-range indexes return the list unchanged.
  - `removeAt` removes one item.
  - `defaultPlaylist()` is the three classics with names "Classic 1", "Classic 2" and "Classic 3".
  - `tileSource(1)` is `{ x: 0, y: 0 }`, `tileSource(4)` is `{ x: 96, y: 0 }`, and `tileSource(5)` is `{ x: 0, y: 30 }`. `tileIdAt('.3', 1)` is 3.
  - `updatedLabel` gives `'today'` for the same day and `'2 days ago'` two days back in `en`. In `es`, two days back is `'hace 2 días'`.
  - The store's `createRoom('Sala', ['classic-1'])` calls `actions.createRoom('Sala', ['classic-1'])`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** `fetchLevels` throws on a non-2xx answer, like `fetchRooms`.
- [ ] **Step 4: Verify.** Everything is green, and typecheck and lint pass.
- [ ] **Step 5: Commit** `feat(client): levels API, playlist model and thumbnail helpers`.

---

### Task 6: Level picker in the create-room dialog; levels in the room table and lobby

**Files:**
- Create: `packages/client/src/ui/level-picker/LevelThumbnail.tsx`, `PlaylistChips.tsx`, `LevelBrowser.tsx`
- Modify: `packages/client/src/ui/dialogs/CreateRoomDialog.tsx`, `packages/client/src/ui/screens/RoomsScreen.tsx`, `packages/client/src/ui/screens/LobbyScreen.tsx`, `packages/client/src/ui/styles.css`, both locale files
- Test: `i18n.test.ts` checks that the two locales have the same keys. Verification is a browser run.

**Interfaces:**
- Consumes: Task 5's helpers and API, and `RoomSummary.levels` and `RoomLobby.levels` (Task 4).

Behaviour, following the approved mockup:

- **Dialog layout**, top to bottom:
  - the room name field;
  - PLAYLIST: numbered chips, starting with the default classics;
  - a search field (debounced 250 ms) with ALL and MINE tabs (MINE only for accounts, which is everyone who can open this dialog);
  - a scrolling list of level rows;
  - the room error line;
  - CREATE, disabled while the playlist is empty, the name is invalid, or a request is pending.
- **Chips:** each chip has its number, the level name and an ✕ button to remove it. Reorder by dragging (HTML5 drag and drop). Keyboard users press Alt+← or Alt+→ on a focused chip to move it. A line under the chips reads "Drag to reorder".
- **Level rows:**
  - Each row shows its thumbnail (`LevelThumbnail`), the name, "by {author}", and either "classic" (built-ins) or `updatedLabel`. Drafts get a "DRAFT" badge.
  - A row is a button that toggles the level in the playlist; a row in the playlist has a highlight border and shows its playlist number.
  - Unplayable levels are disabled, with a "needs spawns and portal" hint.
  - When the playlist is full, adding is disabled and a "Playlist full (10)" hint shows.
- **List data and states:**
  - The list comes from `useInfiniteQuery` on `[...LEVELS_QUERY_KEY, search, mine]`, with a MORE button while `nextOffset` isn't null.
  - While loading, show "Looking for levels..."; on an empty result, "No levels found."; on an error, "Could not load the levels."
- **`LevelThumbnail`:** an 80 × 60 CSS-pixel canvas with an internal size of 200 × 150. It loads `assets/textures/level-tiles.png` once (module-level `Image` promise) and draws each tile with `tileSource`, scaled to 8 × 7.5 on a navy background. Keep image smoothing off.
- **Room table:** a "Levels" column shows the names joined with ", ", with CSS ellipsis and the full list as a `title`.
- **Lobby:** a "Levels:" line lists "1. A, 2. B, ..." under the title.
- **i18n keys** (es and en):
  - `createRoom.playlist`, `createRoom.dragHint`, `createRoom.search`, `createRoom.all`, `createRoom.mine`, `createRoom.by`
  - `createRoom.classic`, `createRoom.draft`, `createRoom.unplayable`, `createRoom.full`, `createRoom.more`, `createRoom.remove`
  - `createRoom.loadingLevels`, `createRoom.noLevels`, `createRoom.levelsError`
  - `rooms.levels`, `lobby.levels`, `roomError.levelUnavailable`

- [ ] **Step 1: Build** the components, the dialog, the table column, the lobby line, the CSS and the i18n.
- [ ] **Step 2: Verify.** `npm test`, typecheck and lint are clean. Run `npm run build` and note the chunk sizes; the picker belongs in the lazily loaded RoomsScreen chunk.
- [ ] **Step 3: Browser check** (Playwright, `npm run dev`):
  - The dialog opens with the three classics as chips and lists the classics with thumbnails.
  - Search filters the list. Toggling adds and removes chips; drag reorders them; ✕ removes one.
  - Create a room with "Classic 3, Classic 1". The lobby lists them in that order, and so does the room table.
  - Start a match: level 1 is Classic 3.
  - Create a draft through the API with `fetch` in the page. It shows under MINE with a DRAFT badge, and it can be played if it is playable.
  - Take screenshots in es and en.
- [ ] **Step 4: Commit** `feat(client): level picker when creating a room`.

---

## Notes for the executor

- `room.test.ts` and the integration tests build rooms in many places. Wrap `CLASSIC_PLAYLIST` entries with a small test helper instead of editing every call.
- `createRoom` in the gateway becomes async. Keep the stage 2 behaviour: the rate limit is hit first, and a missing or non-function ack is tolerated.
- `levelStarted.level` already carries the level data (stage 1), so the client needs no change to play database levels.
