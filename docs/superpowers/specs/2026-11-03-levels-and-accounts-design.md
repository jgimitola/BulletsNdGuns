# Player-made levels and accounts

Date: 2026-11-03. Status: draft for approval.

## Intent

Today the game ships three hardcoded levels (Tiled JSON maps plus hand-typed coordinates in
`packages/shared/src/levels/level-registry.ts`), and every match plays them in order 1 → 2 → 3.
Making or changing a level means editing files and redeploying.

We want levels to come from players. A player (or the project owner) opens an in-game editor,
builds a basic level in about ten minutes, presses a button to test it, and keeps it. Later they
refine it, discard it, or publish it because they think it is cool and challenging and want others
to try it. When someone creates a room, they pick one level or an ordered playlist of several from
everyone's published levels.

To know who made what, and to stop people from changing levels that aren't theirs, the game gets
accounts now, not later.

## Goals

1. Accounts: register, sign in, sign out, profile modal (change nickname, change password).
2. Guests can still play by typing a nickname, but only signed-in players can create rooms and
   create, edit, publish, or delete levels.
3. Nicknames are unique across accounts and online guests, with accounts taking priority.
4. Levels live in a database, behind a storage layer that can be swapped for another database
   without touching game or HTTP code. SQLite is the first implementation.
5. In-game level editor: tiles, two spawns, portal, coins, ammo. Test in place. Save, publish,
   unpublish, delete, duplicate.
6. Room creation picks one level or an ordered playlist, from a searchable list with thumbnails.
7. The three classic levels move into the database as built-in levels and stay the default
   playlist. Level 1's top-corridor challenge is restored while doing so.

## Non-goals

- Email verification, forgot password, changing email, OAuth/social sign-in.
- Beatability checks before publishing. Anyone can publish anything that has the pieces a match
  needs (see "Save, test, publish").
- Ratings, play counts, comments, moderation, reporting.
- Levels larger than one screen, camera scrolling, new tile art, new object types.
- Admin tools.

## Anti-goals

- Storage code leaking SQLite specifics (SQL strings, driver types) into rooms, HTTP handlers, or
  the editor. Swapping databases later must mean writing a new store implementation, nothing else.
- A guest being able to pose as a registered player.
- A level edit or delete breaking a match that is already running.
- Breaking the server-authoritative model: the server still owns every match's simulation; the
  client never sends level data into a match.

## Constraints (from the existing project)

- TypeScript monorepo (`packages/shared`, `server`, `client`), Node 24 running `.ts` directly,
  Express 5, Socket.io 4, Phaser 4, React 19 + Zustand + Radix + TanStack Query, Vitest.
- Read the Phaser 4 docs before writing Phaser code; the API changed from Phaser 3.
- Code in English. Every player-facing string goes through i18n with both `es` and `en`.
- Pixel arcade UI style already in `packages/client/src/ui/styles.css`.
- Stay deploy-ready: `PORT`, the Dockerfile (node:24-alpine, production deps only), running
  locally with `npm run dev` (Vite proxies `/api` and `/socket.io` to the server).
- All movement tuning stays in `MOVEMENT`; this work doesn't change gameplay rules.

## Accounts

**Library: better-auth** (the user's choice), mounted on the existing Express app at
`/api/auth/*splat`, before `express.json()` and before the `/api` 404 handler.

**Register:** email, nickname, password. No email verification. Sign-in is with email + password
(builder's call: the nickname could also be allowed, via better-auth's username plugin
`signIn.username`; email-only is fine).

**Nickname as an account field:** use better-auth's username plugin, or an additional user field,
so the nickname is unique at the database level. Normalisation and validation must match guest
nicknames: reuse `parseNickname` rules (1..12 code points, no control characters), compared
case-insensitively (`toLowerCase()` after NFKC is the suggested key). The plugin's default
validator (alphanumeric, `_`, `.`) must be replaced so account and guest names follow the same
rules. Store the name as typed for display and a normalised key for uniqueness.

**Session:** better-auth's cookie session, remembered between visits. HTTP handlers read it with
`auth.api.getSession({ headers: fromNodeHeaders(req.headers) })`. The Socket.io connection reads
the same cookie from the handshake headers, so each socket knows whether it belongs to an account
(and which) or to a guest.

**Profile modal** (signed-in only): shows email (read-only) and nickname. Change nickname. Change
password (needs current password). Sign out.

**Permissions:**

| Action | Guest | Signed in |
|---|---|---|
| Join a room and play | yes | yes |
| Create a room | no | yes |
| Open the editor, create levels | no | yes |
| Edit, publish, unpublish, delete a level | no | own levels only |
| Duplicate a level | no | any published level, or own |

Every one of these is checked on the server; the client only hides buttons.

**Secrets and config:** `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` (or equivalent) from env, with a
dev default for local runs only. Trusted origins must include the Vite dev origin.

## Nicknames

Unique, case-insensitive, across registered accounts **and** guests currently online.

- A guest picks a nickname that an account owns: refused ("nickname taken").
- A guest picks a nickname another online guest is using: refused.
- A player registers, or renames in their profile, to a nickname an online guest is using right
  now: the account wins. That guest is told their nickname is no longer available:
  - mid-match: they finish the match under the old name, then see the notice and must pick a new
    nickname before joining another room;
  - anywhere else (menu, room list, lobby): the notice appears at once and they pick a new one,
    staying in their lobby if they are in one.
- Registering or renaming to a nickname another **account** owns: refused.

This needs a server-side presence registry: which nicknames are online, held by which socket,
guest or account. Guests claim a nickname when they press "Play as guest" (a socket event with an
ack), not on each create/join as today. Account sockets take their nickname from the session.
Registration and nickname changes (better-auth database hooks, or a check around the update call)
tell the registry, which notifies any guest holding that name.

Builder's calls: one account signed in on two tabs shows the same nickname twice, which is fine. A
player who renames while in a lobby or match keeps the old name inside that room; the new name
applies from the next room.

## Storage layer

The game code talks to interfaces, never to a database driver:

```ts
interface LevelStore {
  list(query: LevelQuery): Promise<LevelSummary[]>; // published + caller's own; search; paging
  get(id: LevelId): Promise<LevelRecord | null>;
  create(authorId: AccountId, draft: LevelDraft): Promise<LevelRecord>;
  update(id: LevelId, draft: LevelDraft): Promise<LevelRecord>;
  setPublished(id: LevelId, published: boolean): Promise<void>;
  delete(id: LevelId): Promise<void>;
}
```

(Names and exact shape are the builder's; the point is the boundary.) Ownership checks live above
the store, in the service that HTTP handlers call, so a new store doesn't have to re-implement
them.

**First implementation: Kysely over SQLite.** better-auth already uses Kysely internally, so auth
tables and level tables share one database and one query builder; moving to Postgres or MySQL later
means changing the Kysely dialect and re-running migrations. Driver: prefer the built-in
`node:sqlite` (no native build step in the alpine Docker image); fall back to `better-sqlite3` if
`node:sqlite` doesn't work with Kysely or better-auth in practice. Builder decides after trying.

Database file path from env (`DATABASE_PATH`, default under a gitignored `data/` directory). The
Dockerfile documents a volume for it. Migrations run on server start (better-auth's schema plus our
own tables). Tests use an in-memory database.

Every level row carries `author_id` (the account id). Built-in levels have no account author and a
`builtin` flag; they are shown as by "BulletsNdGuns", and that nickname is reserved so nobody can
register it.

## Level format

Replace Tiled JSON with the game's own format, shared between client, server, and editor:

```ts
interface LevelData {
  cols: 25; rows: 20;            // fixed, one screen of 32 px tiles (800×600)
  tiles: number[];               // row-major, 0 = empty, 1..8 = tileset tile
  spawns: { left: Vec2; right: Vec2 };
  portal: Vec2;
  coins: Vec2[];
  ammo: Vec2[];
}
```

Positions are pixels, in the same convention `level-registry.ts` uses today, so the three classic
levels convert exactly (their objects are not always grid-aligned). The editor snaps new objects
to the tile grid. Pickup ids become array indexes, assigned when a match starts.

Every non-empty tile is solid, as today. The client builds the Phaser tilemap from `tiles`
(Phaser's tilemap-from-data API) instead of a cached Tiled map.

Validation (one shared `parseLevelData`, run on the server for every save and in the editor):
correct dimensions, tile ids in range, positions inside the level, at most 100 coins and 100 ammo
pickups (builder may tune), name 1..24 characters (same rules as room names).

A conversion script (or one-off test-backed function) turns the three Tiled maps plus registry
coordinates into `LevelData`, and the results are seeded as built-in levels on first start. After
conversion, widen level 1's top-corridor holes so it is a challenge again under the new movement
(the movement redesign of 2026-11-02 made the one-tile holes trivial). The Tiled loader
(`physics/tiled.ts`) and the map JSONs can then be deleted.

## Matches and rooms

- **Create room** (signed-in only): room name plus a playlist of 1..N level ids (N capped, e.g.
  10). Default playlist: the three classic levels.
- When the room is created, the server loads those levels from the store and keeps its own copy.
  Editing, unpublishing, or deleting a level afterwards doesn't affect that room.
  A playlist may contain published levels and the creator's own levels (drafts included, so they
  can try a draft with friends before publishing). (My call.)
- A playlist of one is a single-level match. Several are played in order, scores add up, highest
  score wins after the last one, exactly like today's 1 → 2 → 3.
- `levelIndex` in inputs and snapshots becomes the index into the room's playlist.
- `levelStarted` carries the level's `LevelData`, since the client no longer has levels bundled.
- The simulation (`createWorld`, `startLevel`, `stepWorld`) takes level data, not an index into a
  global registry, so the server, the editor's test mode, and tests all run it the same way.
- The room table and lobby show each room's playlist (level names).

## Level browser (create-room dialog)

As shown in the approved mockup (`.superpowers/brainstorm/.../room-level-picker.html`):

- Room name field.
- Playlist row: numbered chips, remove with ✕, drag to reorder.
- Search by level name or author nickname. Tabs: ALL / MINE.
- Level rows: small thumbnail drawn from the level's tiles, name, author, last updated. Click to
  add to the playlist; click again to remove.
- Create button.

The list comes from `GET /api/levels` (published + the caller's own), paged.

## Editor

Reached from **My levels** on the menu (signed-in only). My levels lists the player's own levels
with: New, Edit, Publish/Unpublish, Duplicate, Delete (with confirmation). Any published level can
also be duplicated from the level browser into the player's own copy, which is how built-in levels
get edited.

Layout (approved option A):

- The level fills the 800×600 game area at real size, with a faint grid.
- One floating toolbar over it, draggable and collapsible, like the debug panel.
- Tools: the 8 tileset tiles, coin, ammo, portal, left spawn, right spawn, eraser. Number keys pick
  tools.
- Click or drag paints tiles. Click places objects. Portal and each spawn are single: placing again
  moves them. Eraser removes tiles and objects under the cursor.
- Buttons: Test, Save, and a menu with rename, delete, back to My levels.
- Builder's call: undo/redo (Ctrl+Z / Ctrl+Y). Warn before leaving with unsaved changes.

The editor is a Phaser scene for the level canvas plus a React overlay for the toolbar and dialogs,
following how the game already splits Phaser and React.

## Save, test, publish

- **Save** stores the level privately (a draft). Drafts may be incomplete.
- **Test** runs the level right there in the browser, the player alone, using the shared simulation
  (same rules the server uses). No room, no server round trip. Esc returns to the editor where
  they left off. Needs both spawns and the portal.
- **Publish** makes the level visible to everyone. Needs both spawns and the portal (so a match can
  start and end), nothing else; no beatability check. **Unpublish** hides it again.
- Only publishable levels can be public. Each level has one stored copy: saving a published level
  is refused while it lacks what Publish needs, so an edit can never put an unfinishable level in
  front of other players (user's decision, option (a)). To make big incomplete changes, unpublish
  first or duplicate.
- Editing a published level changes it for everyone, from the next room that picks it.
- **Delete** removes the level. Running rooms keep their copy.

## Menu changes

- Signed out: Sign in, Register, nickname field + Play as guest, How to play, credits, language.
- Signed in: nickname shown, Profile, My levels, Play, How to play, credits, language.
- The room list hides the Create room button for guests (with a short hint to sign in).

## HTTP API (sketch, builder refines)

- `/api/auth/*` — better-auth.
- `GET /api/levels?search=&mine=&cursor=` — summaries (id, name, author, updatedAt, published,
  tiles for the thumbnail).
- `GET /api/levels/:id` — full level.
- `POST /api/levels` — create; `PUT /api/levels/:id` — update; `DELETE /api/levels/:id`.
- `POST /api/levels/:id/publish`, `/unpublish`, `/duplicate`.

Mutations require a session and ownership. Request bodies size-limited. Rate-limit writes the way
the socket gateway rate-limits room actions.

## Testing

Test-first, as in previous sessions. In particular:

- `parseLevelData` and the classic-level conversion (converted levels match today's spawns, portal,
  pickups, and solid tiles exactly, except the intended level 1 corridor change).
- The simulation running from `LevelData`; existing world tests ported.
- The level store against in-memory SQLite, and the level service's ownership rules.
- Nickname registry: guest vs guest, guest vs account, account takes over a guest's name (lobby
  and mid-match cases).
- Rooms with playlists: copy at creation, one-level and multi-level matches, edits after creation
  not leaking in.
- Server integration: register, sign in, create a level, publish, create a room with it, guest
  joins and plays.

## Decisions settled after review

- **Publishable** means both spawns (left and right) plus the portal, because matches assign
  players to left and right sides. The user said "at least a spawn and a portal"; requiring both
  is my reading and needs their confirmation on reading this document.
- A guest who registers (or signs in) with the nickname they are already using is the same person:
  no "nickname no longer available" notice. The client tells the server which guest connection is
  theirs (for example by reconnecting the socket right after sign-in/register before the registry
  processes the takeover, or by passing its socket id). Builder picks the mechanism. (My call.)
- After sign-in, sign-out, or register, the client reconnects its socket so the server sees the new
  session. (My call.)
- Built-in levels are defined in code and upserted on every server start, so code stays their
  source of truth and fixes reach existing databases. (My call.)
- Level 1's corridor: the builder widens the holes (two tiles is the starting guess) and the user
  playtests it before stage 1 counts as done. (My call.)
- Drafts missing a spawn or the portal cannot be added to a playlist. Test mode uses the left spawn.
  (My call.)
- Position bounds allow the small overhang the classic levels use (level 1's right spawn is at
  x = 803, a sprite centre): positions must lie within the level plus a margin of half a tile.
  (My call.)

## Left to the builder

Exact type and function names; table layout; paging details; the cap values marked "e.g." or
"builder may tune"; whether sign-in also accepts the nickname; `node:sqlite` vs `better-sqlite3`;
how the thumbnail is drawn; how the stages below are split into plans.

## Suggested build order

Each stage leaves the game working:

1. Level format + simulation from `LevelData`; classic levels converted (still bundled).
2. Database + storage layer + better-auth + menu/profile/register; nickname registry.
3. Levels in the database; levels API; rooms with playlists; level browser in create-room.
4. Editor, My levels, Test, publish.
