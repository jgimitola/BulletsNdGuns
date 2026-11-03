# Level Data Format (Stage 1 of Levels + Accounts) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levels become plain game data (`LevelData`) instead of Tiled maps plus a hardcoded registry; the simulation, server rooms and client all run from that data, and level 1's top corridor is a challenge again.

**Architecture:** `packages/shared/src/levels/` gets the data format and its validator (`level-data.ts`), the runtime level built from it (`level.ts`: tile grid + pickups with index ids), and the three classic levels written as tile-row strings (`classic-levels.ts`). The simulation takes a `Level` argument instead of looking one up by index. A `Room` receives its playlist of `Level`s (stage 1: always the classics) and sends each level's data in `levelStarted`, so the client no longer bundles maps. The Tiled loader, the map JSONs and `level-registry.ts` are deleted.

**Tech Stack:** TypeScript, Phaser 4 (`^4.2.1`), Socket.io 4, Vitest, npm workspaces.

**Spec:** `docs/superpowers/specs/2026-11-03-levels-and-accounts-design.md` (sections "Level format", "Matches and rooms", "Decisions settled after review"; build order stage 1).

## Global Constraints

- Code in English; any player-facing string goes through i18n with both `es` and `en` (this stage adds none).
- Read the Phaser 4 docs (or `C:\Users\jesus\Documents\Proyectos\phaser\src`, v4.2.1) before Phaser code; don't assume the Phaser 3 API.
- Gameplay rules don't change. All movement numbers stay in `MOVEMENT`. The only intended level change is Task 6.
- Level size is fixed: 25 columns × 20 rows of 32 px tiles (800 × 600).
- Every non-empty tile is solid. Tile ids are 0 (empty) and 1..8 (the 8 tiles of `level-tiles.png`, same numbering Tiled used with firstgid 1).
- Positions are pixels in today's conventions: spawns are sprite centres; coins/ammo are pickup anchors (`coinRect`/`ammoPickupRect` unchanged); portal is the portal image centre.
- Positions must lie within the level plus a margin of half a tile: x ∈ [−16, 816], y ∈ [−16, 616].
- At most 100 coins and 100 ammo pickups per level.
- Pickup ids are array indexes (0-based), assigned when a `Level` is built.
- Run checks from the repo root: `npm test`, `npm run typecheck`, `npm run lint`.

## Review Focus

1. Hostile or malformed level JSON (wrong tile count, tile id 9, NaN/Infinity/strings as coordinates, 10 000 coins, extra fields, `null`) must return `null` from `parseLevelData` and never throw — the server will feed it untrusted bodies in stage 3. Test in Task 1.
2. A one-level playlist: reaching the portal ends the match (`completed`) instead of trying to start level index 1. Test in Task 4.
3. A level with zero coins and zero ammo builds and steps fine, and its snapshots carry empty id lists. Test in Task 3.
4. Tile ids render as the same art as before: id 1 must draw the first tile of `level-tiles.png`, and empty must draw nothing (Phaser uses −1 for empty). Test the conversion helper in Task 5; check visually in Task 5's run step.
5. Level 1's right spawn at x = 803 (outside 800) is valid; x = 817 is not. Test in Task 1.

---

### Task 1: Level data format and validator

**Files:**
- Create: `packages/shared/src/levels/level-data.ts`
- Modify: `packages/shared/src/index.ts` (export it)
- Test: `packages/shared/test/level-data.test.ts`

**Interfaces:**
- Produces:
  - `LEVEL_COLS = 25`, `LEVEL_ROWS = 20`, `TILE_SIZE = 32`, `TILE_KINDS = 8`, `MAX_PICKUPS_PER_KIND = 100`, `POSITION_MARGIN = 16`
  - `type Side = 'left' | 'right'` (moves here from `level-registry.ts`)
  - `interface LevelData { cols: number; rows: number; tiles: number[]; spawns: { left: Vec2 | null; right: Vec2 | null }; portal: Vec2 | null; coins: Vec2[]; ammo: Vec2[] }`
  - `interface PlayableLevelData extends LevelData { spawns: Record<Side, Vec2>; portal: Vec2 }`
  - `parseLevelData(raw: unknown): LevelData | null` — never throws; returns a fresh object holding only the known fields.
  - `isPlayable(data: LevelData): data is PlayableLevelData` — both spawns and the portal present.
  - `tilesFromRows(rows: readonly string[]): number[]` — `'.'` → 0, `'1'..'8'` → 1..8; throws on any other character or wrong size (used only for data written in code).
  - `tilesToRows(tiles: readonly number[]): string[]` — inverse.

- [ ] **Step 1: Write the failing tests**

```ts
const empty = (): LevelData => ({
  cols: 25, rows: 20, tiles: Array(500).fill(0),
  spawns: { left: { x: 13, y: 514 }, right: { x: 803, y: 514 } },
  portal: { x: 704, y: 60 }, coins: [{ x: 704, y: 540 }], ammo: [],
});

test('parseLevelData accepts a valid level and returns a fresh copy without extra fields', () => {
  const raw = { ...empty(), extra: 1 };
  const parsed = parseLevelData(raw);
  expect(parsed).toEqual(empty());
  expect(parsed).not.toBe(raw);
  expect(parsed!.tiles).not.toBe(raw.tiles);
});

test('parseLevelData accepts drafts without spawns or portal', () => {
  const draft = { ...empty(), spawns: { left: null, right: null }, portal: null };
  expect(parseLevelData(draft)).toEqual(draft);
  expect(isPlayable(parseLevelData(draft)!)).toBe(false);
  expect(isPlayable(empty())).toBe(true);
});

test.each([
  ['null', null],
  ['array', []],
  ['wrong cols', { ...empty(), cols: 26 }],
  ['short tiles', { ...empty(), tiles: Array(499).fill(0) }],
  ['tile id 9', { ...empty(), tiles: [9, ...Array(499).fill(0)] }],
  ['fractional tile', { ...empty(), tiles: [1.5, ...Array(499).fill(0)] }],
  ['NaN coordinate', { ...empty(), portal: { x: NaN, y: 0 } }],
  ['Infinity coordinate', { ...empty(), coins: [{ x: Infinity, y: 0 }] }],
  ['string coordinate', { ...empty(), coins: [{ x: '1', y: 0 }] }],
  ['x beyond margin', { ...empty(), spawns: { left: null, right: { x: 817, y: 514 } } }],
  ['y beyond margin', { ...empty(), portal: { x: 10, y: -17 } }],
  ['too many coins', { ...empty(), coins: Array(101).fill({ x: 0, y: 0 }) }],
  ['spawns missing', { ...empty(), spawns: undefined }],
])('parseLevelData rejects %s', (_name, raw) => {
  expect(parseLevelData(raw)).toBeNull();
});

test('positions on the margin edge are accepted (level 1 right spawn is x = 803)', () => {
  expect(parseLevelData({ ...empty(), coins: [{ x: 816, y: 616 }, { x: -16, y: -16 }] })).not.toBeNull();
});

test('tilesFromRows and tilesToRows round-trip', () => {
  const rows = Array.from({ length: 20 }, (_, r) => (r === 0 ? '12345678' + '.'.repeat(17) : '.'.repeat(25)));
  const tiles = tilesFromRows(rows);
  expect(tiles.slice(0, 9)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 0]);
  expect(tilesToRows(tiles)).toEqual(rows);
  expect(() => tilesFromRows(rows.slice(1))).toThrow();
  expect(() => tilesFromRows(['9' + '.'.repeat(24), ...rows.slice(1)])).toThrow();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/shared/test/level-data.test.ts`
Expected: FAIL, module `../src/levels/level-data.ts` not found.

- [ ] **Step 3: Implement `level-data.ts`**

Follow the `parseCreateRoom` style in `protocol/rooms.ts` (try/catch, `asRecord`-like guard). Check array lengths before iterating so a huge array is rejected cheaply. Export it from `packages/shared/src/index.ts`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run packages/shared/test/level-data.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/levels/level-data.ts packages/shared/src/index.ts packages/shared/test/level-data.test.ts
git commit -m "feat(shared): level data format and validator"
```

---

### Task 2: Runtime level, tile grid from tiles, classic levels as data

**Files:**
- Create: `packages/shared/src/levels/level.ts`
- Create: `packages/shared/src/levels/classic-levels.ts`
- Modify: `packages/shared/src/physics/tile-grid.ts` (add `buildTileGridFromTiles`; the Tiled-based `buildTileGrid` stays until Task 3)
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/test/classic-levels.test.ts`

**Interfaces:**
- Consumes: Task 1 (`PlayableLevelData`, `tilesFromRows`, `LEVEL_COLS`, `LEVEL_ROWS`, `TILE_SIZE`).
- Produces:
  - `buildTileGridFromTiles(tiles: readonly number[], cols: number, rows: number, tileSize: number): TileGrid` in `tile-grid.ts` (renamed to `buildTileGrid` in Task 3).
  - In `level.ts`: `interface Pickup { id: number; x: number; y: number }`; `interface Level { data: PlayableLevelData; grid: TileGrid; spawns: Record<Side, Vec2>; portal: Vec2; ammoPickups: readonly Pickup[]; coins: readonly Pickup[] }`; `buildLevel(data: PlayableLevelData): Level` (pickup ids = array index); `ammoPickupRect(p: Pickup): Rect`, `coinRect(p: Pickup): Rect`, `portalRect(level: { portal: Vec2 }): Rect` with today's exact formulas from `level-registry.ts`.
  - In `classic-levels.ts`: `interface BuiltinLevel { slug: string; name: string; data: PlayableLevelData }`; `CLASSIC_LEVELS: readonly BuiltinLevel[]` with slugs `classic-1`, `classic-2`, `classic-3` and names `Classic 1`, `Classic 2`, `Classic 3`; `CLASSIC_PLAYLIST: readonly Level[]` (the three built once).

Classic tiles, transcribed from the Tiled maps (`'.'` empty). Level 1 rows 0–19:

```
...........2.2.2.2...78..
.........................
.........................
........222.2.2.2.222222.
222......................
.........................
.........................
....22.............22....
.........................
.......22..222..22.......
2222.................2222
.........................
......222.......222......
.........................
.........................
.2222......222......2222.
.......2.........2.......
.........................
1111111111111111111111111
1111111111111111111111111
```

Level 2:

```
78.......................
.........................
.........................
12......................1
222.....................2
2222222...........2222222
2........11.............2
2.............11........2
2.......................2
2.......................2
211111......1......111112
12222...............22221
2.......................2
2..........212..........2
2.....11.........11.....2
2.1...22.........22...1.2
2.....221.......122.....2
2...112221.....122211...2
2.....2112.....2112.....2
1222222112111112112222221
```

Level 3:

```
............78...........
.........................
.........................
.......12121212121.......
..2.2...............2.2..
11.....................11
2....2....21212....2....2
2...2...............2...2
111...................111
2......111.....111......2
2.111111.........11111..2
2..........222..........2
2.........22222.........2
2.......111111111.......2
2.......................2
2....11...........11....2
11.....................11
2.......................2
2...111...........111...2
1111111111111111111111111
```

Spawns, portal, coins (`coins`) and ammo (`ammo`, from `ammoPickups`) are copied from `level-registry.ts` in the same order, dropping the `id` fields.

- [ ] **Step 1: Write the failing tests**

```ts
import { decodeLayer } from '../src/physics/tiled.ts';
import { LEVELS } from '../src/levels/level-registry.ts';

test.each([0, 1, 2])('classic level %i matches the original Tiled map and registry', (i) => {
  const classic = CLASSIC_LEVELS[i]!;
  const old = LEVELS[i]!;
  expect(classic.data.tiles).toEqual([...decodeLayer(old.map, PLATFORM_LAYER)]);
  expect(classic.data.spawns).toEqual(old.spawns);
  expect(classic.data.portal).toEqual(old.portal);
  expect(classic.data.coins).toEqual(old.coins.map(({ x, y }) => ({ x, y })));
  expect(classic.data.ammo).toEqual(old.ammoPickups.map(({ x, y }) => ({ x, y })));
  expect(parseLevelData(classic.data)).toEqual(classic.data);
});

test('classic slugs, names and playlist', () => {
  expect(CLASSIC_LEVELS.map((l) => [l.slug, l.name])).toEqual([
    ['classic-1', 'Classic 1'], ['classic-2', 'Classic 2'], ['classic-3', 'Classic 3'],
  ]);
  expect(CLASSIC_PLAYLIST).toHaveLength(3);
});

test('buildLevel numbers pickups by index and builds a solid grid from tiles', () => {
  const level = CLASSIC_PLAYLIST[0]!;
  expect(level.coins.map((c) => c.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  expect(level.ammoPickups[0]).toEqual({ id: 0, x: 416, y: 540 });
  expect(level.grid.isSolid(0, 18)).toBe(true);   // floor
  expect(level.grid.isSolid(0, 0)).toBe(false);
  expect(level.grid.isSolid(-1, 0)).toBe(false);
  expect(level.grid.isSolid(25, 18)).toBe(false);
});

test('pickup and portal rects keep their formulas', () => {
  expect(ammoPickupRect({ id: 0, x: 416, y: 540 })).toEqual({ x: 427, y: 510, width: 10, height: 30 });
  expect(coinRect({ id: 0, x: 100, y: 200 })).toEqual({ x: 104, y: 174, width: 25, height: 23 });
  expect(portalRect(CLASSIC_PLAYLIST[0]!)).toEqual({ x: 682, y: 30, width: 44, height: 60 });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/shared/test/classic-levels.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `buildTileGridFromTiles`, `level.ts` and `classic-levels.ts`**

Write each level's tiles as a `const` array of 20 row strings passed to `tilesFromRows`, so tile edits are readable diffs. Keep `isSolid` bounds behaviour identical to today's `buildTileGrid`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run packages/shared/test/classic-levels.test.ts`
Expected: PASS (all three levels match the Tiled data exactly).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src packages/shared/test/classic-levels.test.ts
git commit -m "feat(shared): classic levels as level data"
```

---

### Task 3: Simulation runs from a `Level`; delete the Tiled path

**Files:**
- Modify: `packages/shared/src/simulation/world.ts`, `player.ts`, `bullet.ts` (import `Level`, `Side`, rects from the new modules)
- Modify: `packages/shared/src/physics/tile-grid.ts` (delete Tiled `buildTileGrid`; rename `buildTileGridFromTiles` → `buildTileGrid`)
- Modify: `packages/shared/src/constants.ts` (delete `PLATFORM_LAYER`; keep `TILESET_NAME`)
- Modify: `packages/shared/src/index.ts`
- Delete: `packages/shared/src/levels/level-registry.ts`, `packages/shared/src/physics/tiled.ts`, `packages/shared/src/levels/maps/` (3 JSONs), `packages/shared/test/levels.test.ts`
- Modify tests: `packages/shared/test/world.test.ts`, `player.test.ts`, `physics.test.ts`, `tile-collision.test.ts`, `protocol.test.ts`, `classic-levels.test.ts`

**Interfaces:**
- Consumes: Task 2 (`Level`, `buildLevel`, `CLASSIC_PLAYLIST`, rects).
- Produces (later tasks call these):
  - `createWorld(players: readonly { id: PlayerId; side: Side }[], level: Level): WorldState` — `levelIndex` 0.
  - `startLevel(world: WorldState, levelIndex: number, level: Level): WorldState`
  - `stepWorld(world: WorldState, inputs: ReadonlyMap<PlayerId, InputFrame>, level: Level): { world: WorldState; events: WorldEvent[] }`
  - `WorldState` unchanged; `levelIndex` now means "index in the room's playlist".
  - `buildTileGrid(tiles: readonly number[], cols: number, rows: number, tileSize: number): TileGrid`

- [ ] **Step 1: Update the tests to the new API (they fail to compile/run)**

In every shared test, replace `getLevel(n)` with `CLASSIC_PLAYLIST[n]!` and pass the level to `createWorld`/`startLevel`/`stepWorld`. Pickup ids in `world.test.ts` events become indexes (today's `pickupId: 1` for the first coin/ammo becomes `pickupId: 0`). In `classic-levels.test.ts`, replace the Tiled comparison with a fingerprint that survives the deletion:

```ts
test('classic levels keep their solid tile counts', () => {
  expect(CLASSIC_LEVELS.map((l) => l.data.tiles.filter((t) => t !== 0).length)).toEqual([109, 136, 131]);
});
```

(counts taken from the Tiled maps). Add the Review Focus #3 test to `world.test.ts`:

```ts
test('a level without pickups steps and snapshots with empty id lists', () => {
  const bare = buildLevel({ ...CLASSIC_LEVELS[0]!.data, coins: [], ammo: [] });
  const w = createWorld([{ id: 'a', side: 'left' }, { id: 'b', side: 'right' }], bare);
  const r = stepWorld(w, NONE, bare);
  expect(r.world.coins).toEqual([]);
  expect(toSnapshot(r.world, 0).coinIds).toEqual([]);
  expect(toSnapshot(r.world, 0).ammoPickupIds).toEqual([]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run --project @bng/shared`
Expected: FAIL (signature mismatches / missing exports).

- [ ] **Step 3: Change the simulation signatures, delete the Tiled path and the registry, fix exports**

No behaviour changes beyond where the level comes from.

- [ ] **Step 4: Run shared tests and typecheck**

Run: `npx vitest run --project @bng/shared && npm run typecheck -w @bng/shared`
Expected: PASS. (Server and client won't typecheck until Tasks 4–5.)

- [ ] **Step 5: Commit**

```bash
git add -A packages/shared
git commit -m "refactor(shared): simulation takes a Level; drop Tiled maps and registry"
```

---

### Task 4: Rooms play a playlist and send level data

**Files:**
- Modify: `packages/shared/src/protocol/messages.ts` (`LevelStarted` gains `level`)
- Modify: `packages/server/src/rooms/room.ts`
- Modify: `packages/server/src/index.ts` (factory passes the playlist)
- Modify tests: `packages/server/test/room.test.ts`, `packages/server/test/server.integration.test.ts`

**Interfaces:**
- Consumes: Task 3 (`createWorld`, `startLevel`, `stepWorld` with `Level`), Task 2 (`CLASSIC_PLAYLIST`, `Level`).
- Produces:
  - `interface LevelStarted { levelIndex: number; level: PlayableLevelData; snapshot: Snapshot; nicknames: Record<PlayerId, string> }`
  - `RoomOptions.playlist: readonly Level[]` (required, non-empty). The room keeps this array for its whole life.
  - `RoomFactory` still takes `Pick<RoomOptions, 'id' | 'name' | 'onClosed'>`; `index.ts` adds `playlist: CLASSIC_PLAYLIST` (stage 3 replaces this with the creator's choice).

- [ ] **Step 1: Write the failing tests in `room.test.ts`**

`setup()` takes an optional playlist (default `CLASSIC_PLAYLIST`) and passes it to `Room`. Replace `LEVELS.length - 1` with `CLASSIC_PLAYLIST.length - 1` and `getLevel(n)` with `CLASSIC_PLAYLIST[n]!`. Add:

```ts
test('levelStarted carries the level data of the playlist entry', () => {
  const { transport } = startMatch();
  const started = transport.of('a', 'levelStarted')[0]!.args[0] as LevelStarted;
  expect(started.levelIndex).toBe(0);
  expect(started.level).toEqual(CLASSIC_PLAYLIST[0]!.data);
});

test('a one-level playlist ends the match when its portal is reached', () => {
  const { room, transport, closed } = startMatch(['a', 'b'], [CLASSIC_PLAYLIST[1]!]);
  // put 'a' on the portal of CLASSIC_PLAYLIST[1] (reuse this file's helper that does this) and tick
  room.tick();
  expect(transport.of('a', 'matchEnded')[0]!.args[0]).toMatchObject({ reason: 'completed' });
  expect(transport.of('a', 'levelStarted')).toHaveLength(1);
  expect(closed).toHaveLength(1);
});
```

(`startMatch` gets the same optional playlist parameter.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run --project @bng/server`
Expected: FAIL.

- [ ] **Step 3: Implement**

`Room` stores `playlist`; uses `this.playlist[world.levelIndex]` for `createWorld`/`startLevel`/`stepWorld`; "last level" is `levelIndex === playlist.length - 1`; `sendLevelStarted` adds `level: this.playlist[levelIndex].data`. Constructor throws on an empty playlist.

- [ ] **Step 4: Run server tests and typecheck**

Run: `npx vitest run --project @bng/server && npm run typecheck -w @bng/server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/protocol/messages.ts packages/server
git commit -m "feat(server): rooms play a playlist and send each level's data"
```

---

### Task 5: Client draws and predicts from the received level

**Files:**
- Create: `packages/client/src/render/level-tiles.ts`
- Modify: `packages/client/src/scenes/level-scene.ts`, `packages/client/src/assets/manifest.ts` (stop loading tilemaps), `packages/client/src/net/prediction.ts`, `packages/client/src/net/own-bullets.ts`, `packages/client/src/render/pickup-views.ts`, `packages/client/src/debug/debug-overlay.ts`
- Test: `packages/client/test/level-tiles.test.ts`; update `prediction.test.ts`, `own-bullets.test.ts`, `debug-model.test.ts`, `snapshot-buffer.test.ts`

**Interfaces:**
- Consumes: Task 2 (`buildLevel`, `Level`, `TILE_SIZE`), Task 4 (`LevelStarted.level`).
- Produces:
  - `toPhaserRows(data: LevelData): number[][]` — 20 rows of 25; 0 → −1, other ids unchanged.
  - `new LocalPlayerPredictor(playerId: PlayerId, levelIndex: number, level: Level, initial: PlayerState, firstSeq = 1)`
  - `new OwnBulletTracker(playerId: PlayerId, levelIndex: number, level: Level)`
  - `PickupViews` constructor takes `level: Level`.

- [ ] **Step 1: Write the failing test**

```ts
test('toPhaserRows maps empty to -1 and keeps tile ids', () => {
  const rows = toPhaserRows(CLASSIC_LEVELS[0]!.data);
  expect(rows).toHaveLength(20);
  expect(rows.every((r) => r.length === 25)).toBe(true);
  expect(rows[0]!.slice(9, 13)).toEqual([-1, -1, 2, -1]);
  expect(rows[18]![0]).toBe(1);
});
```

Update the other client tests to pass `CLASSIC_PLAYLIST[0]!` where they used `getLevel(0)` and to the new constructor signatures.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run --project @bng/client`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `LevelScene.create`, `const level = buildLevel(data.level)`; build the map with `this.make.tilemap({ data: toPhaserRows(level.data), tileWidth: TILE_SIZE, tileHeight: TILE_SIZE })`, `map.addTilesetImage(TILESET_NAME, TextureKey.levelTiles, TILE_SIZE, TILE_SIZE, 0, 0, 1)` (gid 1 so id 1 is the image's first tile, as in Tiled), `map.createLayer(0, tileset, 0, 0)`. Pass `level` to the predictor, own-bullet tracker, pickup views and debug overlay. Remove the `load.tilemapTiledJSON` loop and the `LEVELS` import from `manifest.ts`.

- [ ] **Step 4: Run all checks**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all PASS.

- [ ] **Step 5: See it working**

Run `npm run dev`, open two browser clients (Playwright: `page.bringToFront()` on the one sending keys), play through all three levels. Expected: each level looks exactly as on `master` (same tiles, decorations at the top, coins, ammo, portal), pickups disappear when taken, levels advance 1 → 2 → 3 and the match ends. Screenshot each level.

- [ ] **Step 6: Commit**

```bash
git add packages/client
git commit -m "feat(client): draw and predict from the level data the server sends"
```

---

### Task 6: Restore level 1's top-corridor challenge (user playtest checkpoint)

**Files:**
- Modify: `packages/shared/src/levels/classic-levels.ts` (level 1 row 3 and its three top coins)
- Modify: `packages/shared/test/classic-levels.test.ts` (solid count for level 1)

Context: the corridor (rows 1–2 between the ceiling pillars of row 0 and the floor of row 3, columns 8–23) leads to the portal. Its floor has one-tile holes at columns 11, 13, 15, 17 that the 2026-11-02 movement redesign made trivial to cross.

Starting proposal (the user decides by playing):

- Row 3 becomes `........22..2..2..222222.` — two-tile holes at columns 10–11, 13–14, 16–17; single pillars at 12 and 15.
- The three top coins (today at x = 384, 448, 512, y = 90) move to x = 288, 384, 480, y = 90 (on column 9's ledge and the two pillars).

- [ ] **Step 1: Update the test**

Change level 1's solid count in `classic levels keep their solid tile counts` from 109 to 107, and add:

```ts
test('level 1 corridor has two-tile holes', () => {
  expect(tilesToRows(CLASSIC_LEVELS[0]!.data.tiles)[3]).toBe('........22..2..2..222222.');
  expect(CLASSIC_LEVELS[0]!.data.coins.slice(9)).toEqual([{ x: 288, y: 90 }, { x: 384, y: 90 }, { x: 480, y: 90 }]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/shared/test/classic-levels.test.ts`
Expected: FAIL.

- [ ] **Step 3: Edit row 3 and the three coins in `classic-levels.ts`**

- [ ] **Step 4: Run all checks**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): widen level 1 corridor holes"
```

- [ ] **Step 6: Stop for the user's playtest**

Start `npm run dev` and ask the user to play level 1's corridor. Adjust the holes/coins on their feedback (repeat Steps 1–5). Stage 1 is done only when the user says the corridor feels right.
