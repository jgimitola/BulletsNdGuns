# Movement Feel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ported Phaser 3.20 arcade physics with a fair, deterministic platformer controller. It adds a facing-independent hitbox, press-based input, jump buffer, coyote time, corner correction and light momentum, all tunable from one object.

**Architecture:** A player-agnostic `moveBox` in `@bng/shared` moves an AABB through the tile grid one axis at a time. It sweeps each axis and applies corner assists. `stepPlayer` stays pure. It is split into small helpers (velocity, jump, shoot, animation) that read a single frozen `MOVEMENT` tuning object. Server and client prediction share the step, so all new per-player state lives in `PlayerState` and travels in snapshots.

**Tech Stack:** TypeScript 6 (Node type stripping, `.ts` imports), Vitest 5, Phaser 4 (client view and keyboard only), npm workspaces.

**Spec:** `docs/superpowers/specs/2026-11-02-movement-feel-design.md`

## Global Constraints

- Gravity `GRAVITY_Y = 1500`, `JUMP_VELOCITY = -525`, run speed 270 px/s, `SHOT_COOLDOWN_MS = 1000`, ammo, bullet speed: unchanged.
- No tile layout changes. No new moves (short hop, wall jump, double jump, dash).
- Netcode structure unchanged: tick rate, snapshots, interpolation, reconciliation model.
- Every feel number lives in `MOVEMENT` (`packages/shared/src/simulation/movement-tuning.ts`); nothing else hardcodes them.
- `stepPlayer` and `moveBox` are pure and deterministic. No `Math.random`, no wall clock, no mutation of their inputs.
- Read the Phaser 4 docs (phaser.io/oss/docs) before writing Phaser code; the API changed from Phaser 3.
- Comments say why, not what. Match the surrounding style: small named functions, JSDoc on exports, `.ts` import suffixes.
- Commits: conventional (`feat(shared): …`), ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Branch `movement-feel` (already checked out).
- Commands: `npx vitest run <path>`; the whole suite is `npm test`; plus `npm run typecheck` and `npm run lint`.

## Review Focus

1. **Respawn after a hit carries momentum or a buffered jump.** A respawned player should appear at rest: `vx = vy = 0`, `jumpBufferTicks = coyoteTicks = 0`. Test in Task 5.
2. **Float error at flush contact.** A body resting on a floor at a non-integer y, walking across tile boundaries, must not get wall contacts or stop. Test in Task 1.
3. **Spawns at the world edge.** Converted level-1 spawns put the hitbox partly outside the world (left spawn x=13). The player must be clamped inside on the first step and then land normally. Test in Task 5.
4. **Assists must never move the box into a solid tile or outside the world.** A head nudge whose target is occupied, or a ledge catch with a ceiling right above the ledge, must fall back to a normal stop. Test in Task 2.
5. **Press latching across render frames.** A tap during a frame that runs zero ticks, or a frame running several ticks, still yields exactly one press frame. Test in Task 4.

---

### Task 1: Swept tile collision (`moveBox`)

**Files:**
- Create: `packages/shared/src/physics/tile-collision.ts`
- Test: `packages/shared/test/tile-collision.test.ts`

**Interfaces:**
- Consumes: `TileGrid`, `Rect` (existing).
- Produces:
  ```ts
  export interface Contacts { left: boolean; right: boolean; up: boolean; down: boolean }
  export interface CornerAssists { headNudgeMaxPx: number; ledgeCatchMaxPx: number }
  export const NO_ASSISTS: Readonly<CornerAssists>; // both 0
  export interface MoveResult { box: Rect; vx: number; vy: number; contacts: Contacts }
  export function moveBox(box: Rect, vx: number, vy: number, dt: number, grid: TileGrid, assists: CornerAssists): MoveResult
  ```

Algorithm (the tests don't fully determine it): move X by `vx * dt`, then Y by `vy * dt`. For each axis, scan the tile columns (or rows) that the leading edge crosses this step, in travel order. Only the rows (or columns) the box overlaps on the other axis count. Stop flush at the first solid one. Compute overlap ranges with `EPS = 1e-6` shrink, so a box flush against a tile is not overlapping it. Hitting a tile or a world bound (the grid extent, `cols * tileWidth` × `rows * tileHeight`) zeroes that axis' velocity and sets the contact. Assists are ignored in this task. Task 2 adds them.

- [ ] **Step 1: Write failing tests.** Add a test helper `gridFromRows(rows: string[]): TileGrid`. It builds a `TiledMap` with array data and 32 × 30 tiles (`#` = gid 1) and calls `buildTileGrid`. Tests:
  - `falls and lands flush on a floor`: box 27.6 × 34.5 above a floor, `vy = 300`; after enough steps `box.y + box.height === floorTop` (closeTo 1e-9), `vy === 0`, `contacts.down`.
  - `long fall onto a one-tile platform does not tunnel`: `vy = 1400`, dt 1/60, platform one tile thick. The box ends on top, never below.
  - `walking into a wall stops flush`: `contacts.right`, `vx === 0`, `box.x + box.width === wallLeft`.
  - `rising into a ceiling stops flush`: `contacts.up`, `vy === 0`.
  - `slides along a multi-tile floor without snagging`: box resting at a non-integer y on a 10-tile floor, `vx = 270`, 60 steps. `box.x` grows each step until the wall/bound, `left`/`right` stay false, y never changes (Review Focus 2).
  - `world bounds are solid`: an empty grid. Moving left past x=0 clamps to 0 with `contacts.left`. The same holds for right, top and bottom.
- [ ] **Step 2: Run** `npx vitest run packages/shared/test/tile-collision.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `moveBox` per the interface and algorithm above.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(shared): add swept per-axis tile collision`.

### Task 2: Corner assists in `moveBox`

**Files:**
- Modify: `packages/shared/src/physics/tile-collision.ts`
- Test: `packages/shared/test/tile-collision.test.ts`

**Interfaces:**
- Consumes/produces: `moveBox`, `CornerAssists` from Task 1 (signature unchanged).

Rules (from the spec):
- **Head nudge**, during the Y pass. Applies when rising, blocked by solid tiles above, and the box clears them by shifting sideways ≤ `headNudgeMaxPx`. The shifted box must be free at both the current y and the y it rises to. Then shift it and keep rising. Try the smaller shift first, at most once per step.
- **Ledge catch**, during the X pass. Applies when `vy >= 0`, blocked by a tile column, and the top of the highest blocking tile is at most `ledgeCatchMaxPx` above `box.y + box.height`. The box raised to sit on that top must be free, and so must its continued X move. Then raise it, finish the X move, set `vy = 0` and `contacts.down`, and move 0 in the Y pass.

- [ ] **Step 1: Write failing tests** (assists `{ headNudgeMaxPx: 12, ledgeCatchMaxPx: 8 }` unless stated):
  - `head nudge slides through a one-tile gap`: ceiling row with a single 32 px gap. The box (27.6 wide) rises with its left edge 10 px left of the gap's left edge. It ends above the ceiling row, x shifted right by 10 (closeTo), `vy` still negative.
  - `head nudge beyond the limit stops`: same setup, 14 px off. Expected `contacts.up`, `vy === 0`, x unchanged.
  - `head nudge never moves into a solid tile` (Review Focus 4): the nudge target is blocked by a wall tile beside the gap. Expected normal stop.
  - `ledge catch steps onto a ledge 6 px above the feet`: `vy = 100`, `vx = 270`. The box ends on top of the ledge (`box.y + box.height === ledgeTop`), `contacts.down`, `vx === 270`.
  - `ledge 10 px above the feet is a wall`: `contacts.right`, `vx === 0`.
  - `no ledge catch while rising`: same as the 6 px case but `vy = -200`. Expected `contacts.right`.
  - `no ledge catch under a ceiling` (Review Focus 4): a solid tile directly above the ledge leaves no room. Expected `contacts.right`.
  - `NO_ASSISTS keeps plain behaviour`: the 6 px ledge with `NO_ASSISTS` gives `contacts.right`.
- [ ] **Step 2: Run** `npx vitest run packages/shared/test/tile-collision.test.ts`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** both assists as private helpers called from the axis passes. Each gets a comment on why it exists (the fairness rationale).
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(shared): add head nudge and ledge catch corner assists`.

### Task 3: Movement tuning and horizontal velocity

**Files:**
- Create: `packages/shared/src/simulation/movement-tuning.ts`, `packages/shared/src/simulation/horizontal-velocity.ts`
- Modify: `packages/shared/src/index.ts` (export both)
- Test: `packages/shared/test/horizontal-velocity.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const MOVEMENT: Readonly<{ runSpeed: 270; groundAccelTicks: 6; groundDecelTicks: 4; airAccelTicks: 9; airDecelTicks: 15; jumpBufferTicks: 6; coyoteTicks: 6; headNudgeMaxPx: 12; ledgeCatchMaxPx: 8; shotPoseTicks: 12 }>;
  export type MovementTuning = { readonly [K in keyof typeof MOVEMENT]: number };
  export type Direction = -1 | 0 | 1;
  export function nextHorizontalVelocity(vx: number, direction: Direction, onFloor: boolean, tuning?: MovementTuning): number;
  ```
  `MOVEMENT` is `Object.freeze`d. Each field gets a JSDoc line with its unit and meaning (copy the spec table). Per-tick rate = `runSpeed / ticks`. Turning: on the ground the ground decel rate; in the air the air accel rate. Never overshoot the target.

- [ ] **Step 1: Write failing tests:**
  - `ground: reaches 270 in exactly 6 ticks`: from 0, direction 1. After 5 calls `< 270`, after 6 `=== 270`.
  - `ground: stops in exactly 4 ticks`, from 270 with direction 0.
  - `air: reaches 270 in 9 ticks, drifts to 0 in 15`.
  - `ground reversal brakes at the decel rate`: from 270 with direction -1, the first call gives `270 - 67.5`.
  - `air reversal brakes at the air accel rate`: from 270 with direction -1 in the air, the first call gives `240`.
  - `never overshoots`: from 260 with direction 1 on the ground gives 270.
  - `tuning override`: passing `{ ...MOVEMENT, groundAccelTicks: 2 }` reaches 270 in 2 ticks.
- [ ] **Step 2: Run** `npx vitest run packages/shared/test/horizontal-velocity.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** both files.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(shared): add movement tuning and horizontal momentum`.

### Task 4: Press-based input

**Files:**
- Modify: `packages/shared/src/protocol/input.ts`, `packages/shared/src/protocol/messages.ts` (`parseInput`), `packages/shared/src/simulation/player.ts` (mechanical rename only), `packages/client/src/input/keyboard-input.ts`
- Create: `packages/client/src/input/press-latch.ts`
- Test: `packages/client/test/press-latch.test.ts`, plus fixture renames in `packages/shared/test/{protocol,world,player}.test.ts`, `packages/server/test/{room,server.integration}.test.ts`, `packages/client/test/prediction.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // input.ts
  export interface InputFrame { seq: number; level: number; left: boolean; right: boolean; /** Key went down since the previous frame. */ jumpPressed: boolean; shootPressed: boolean }
  // press-latch.ts
  export class PressLatch { press(): void; /** True once per press, then false until the next press. */ take(): boolean }
  ```
  `NEUTRAL_INPUT` has `jumpPressed: false, shootPressed: false`. `parseInput` requires the new names, and frames using `jump`/`shoot` are rejected. `KeyboardInput` keeps one `PressLatch` each for W and SPACE. It calls `press()` from the key's down event (check the Phaser 4 `Key` events in the docs; do not use `isDown` for presses). `read()` calls `take()`. `stepPlayer` reads `input.jumpPressed` / `input.shootPressed` where it read `jump` / `shoot`, with no behaviour change yet.

- [ ] **Step 1: Write failing tests:**
  - `press-latch.test.ts`: `take()` returns false initially; true once after `press()`, then false. Two `press()` calls before one `take()` give a single true, because one tick consumes one press. A press with no `take()` for several frames is still true on the next `take()` (Review Focus 5).
  - `protocol.test.ts`: the valid frame fixture uses `jumpPressed`/`shootPressed`. A frame with `jump: false, shoot: false` and no new fields parses to `null`.
- [ ] **Step 2: Run** `npx vitest run packages/client/test/press-latch.test.ts packages/shared/test/protocol.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the interface changes above. Rename `jump`→`jumpPressed` and `shoot`→`shootPressed` in every test fixture listed under Files. Update README line 47's frame shape.
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat: send jump and shoot as key presses, not held keys`.

### Task 5: Player body, state and step rewrite

**Files:**
- Create: `packages/shared/src/simulation/player-body.ts`
- Modify: `packages/shared/src/simulation/player.ts`, `packages/shared/src/simulation/world.ts`, `packages/shared/src/simulation/bullet.ts` (import `touchesSolidTile` from the new module), `packages/shared/src/levels/level-registry.ts`, `packages/shared/src/physics/tile-grid.ts`, `packages/shared/src/constants.ts`, `packages/shared/src/index.ts`
- Delete: `packages/shared/src/physics/arcade-body.ts`, `packages/shared/src/physics/separate-tile.ts`, `packages/shared/src/physics/collide.ts` (move `touchesSolidTile` into `tile-collision.ts`)
- Test: `packages/shared/test/player.test.ts` (rewrite), `packages/shared/test/physics.test.ts` (keep only tiled decoding, `tilesWithin`, `touchesSolidTile`, `overlaps`), `levels.test.ts`, `constants.test.ts`, `world.test.ts`, `packages/server/test/room.test.ts`, `packages/server/test/server.integration.test.ts`

**Interfaces:**
- Consumes: `moveBox` (Tasks 1-2), `MOVEMENT`, `nextHorizontalVelocity` (Task 3), `InputFrame` (Task 4).
- Produces:
  ```ts
  // player-body.ts
  export const BODY_WIDTH: number;   // 12 * PLAYER_SCALE
  export const BODY_HEIGHT: number;  // 15 * PLAYER_SCALE
  /** Sprite centre minus hitbox centre, per facing: the art is not centred in its frame. */
  export const SPRITE_OFFSET_X: Readonly<Record<Facing, number>>; // { right: 5.5 * PLAYER_SCALE, left: -5.5 * PLAYER_SCALE }
  export const SPRITE_OFFSET_Y: number; // -4 * PLAYER_SCALE
  export function bodyBox(p: Readonly<Vec2>): Rect;                                   // centred on p
  export function spriteCentre(p: Readonly<Vec2>, facing: Facing): Vec2;
  export function hitboxCentreFromSprite(sprite: Readonly<Vec2>, facing: Facing): Vec2;
  // player.ts
  export interface PlayerState { id; side; x; y; vx; vy; facing; onFloor; ammo; score; ticksSinceShot; jumpBufferTicks: number; coyoteTicks: number; shotPoseTicks: number; anim }
  export function createPlayer(id: PlayerId, side: Side, level: Level, score?: number): PlayerState;
  export function respawn(p: PlayerState, level: Level): PlayerState;
  export function stepPlayer(player: PlayerState, input: InputFrame, level: Level): PlayerStepResult; // unchanged signature
  ```
  `Facing` moves to `player-body.ts` (re-exported by `player.ts`) to avoid an import cycle. `x`/`y` are the hitbox centre. `createPlayer` converts the level spawn with `hitboxCentreFromSprite(spawn, initialFacing)`, so level data keeps its original numbers. `respawn` places the player at its converted spawn with `vx = vy = 0` and `jumpBufferTicks = coyoteTicks = 0`, keeping facing, ammo and score. `world.ts` uses it instead of the inline `{ ...victim, x: spawn.x, y: spawn.y }`. Remove `narrow`, `nextNarrow`, `NORMAL_SHAPE`/`NARROW_SHAPE`, `ParkourZone`, `parkourZone`, `RUN_SPEED`, `TILE_BIAS` and tile face flags (`Tile` becomes `{ col, row }`). The bullet spawns at `spriteCentre(next, next.facing)` plus `BULLET_SPAWN_OFFSET_Y`.

Step order in this task follows spec steps 1, 3, 4, 5, 6 (plain jump: `jumpPressed && onFloor`), 7, 8 and 9 (`onFloor` only). Steps 2, 6 (buffer/coyote) and 10 (new animation) come in Tasks 6-7; keep `animationFor` as today, reading `shootPressed`. Each concern is a small helper; `stepPlayer` reads as the numbered list with its order-dependency comments.

- [ ] **Step 1: Write failing tests** in `player.test.ts`, replacing the narrow/bodyBox/order tests:
  - `bodyBox is centred and ignores facing`: `bodyBox({ x: 100, y: 100 })` equals `rect(100 - 13.8, 100 - 17.25, 27.6, 34.5)`.
  - `turning at a ledge edge does not move the hitbox or drop the player`: settle a player at rest facing left on a block, hitbox overhanging the right edge by 10 px. Tick with `right` held: facing becomes right, box x moves by exactly `45 / 60`, `onFloor` true. Tick with `left` held: facing left, box x moves by exactly `vx * dt` for the new `vx`, `onFloor` true.
  - `createPlayer: sprite draws at the original spawn`: `spriteCentre(createPlayer('a','left',L1), 'right')` equals `{ x: 13, y: 514 }` (closeTo).
  - `edge spawn is clamped inside the world and lands` (Review Focus 3): settle from level 1's left spawn. `bodyBox(p).x >= 0` and `onFloor` within 60 ticks.
  - `respawn resets motion` (Review Focus 1): a player with `vx = 270`, `jumpBufferTicks = 3` respawns with zeros at the converted spawn.
  - `momentum: run starts at 45 px/s and reaches 270 on tick 6`.
  - `bullet leaves from the gun in the new facing`: facing right, press `left` and `shootPressed` on the same tick. `bullet.vx === -600` and `bullet.x` equals `spriteCentre(next, 'left').x`.
  - Keep and adapt the existing jump, fall-landing, ammo and cooldown tests.
- [ ] **Step 2: Run** `npx vitest run packages/shared/test/player.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the interface above and delete the Phaser port files.
- [ ] **Step 4: Fix dependent tests.** Recompute expectations that depend on the coordinate anchor, momentum or the deleted parity tests:
  - `world.test.ts`: settled x values, the hit tick, respawn coordinates.
  - `room.test.ts`: the starvation xs test now decelerates after reuse ends, and the "a stands just left of b" setup.
  - `server.integration.test.ts`.
  - `constants.test.ts`: `RUN_SPEED` becomes `MOVEMENT.runSpeed`.

  Keep each test's intent. Never loosen an assertion just to make it pass.
- [ ] **Step 5: Run** `npm test && npm run typecheck && npm run lint`. Expected: all PASS.
- [ ] **Step 6: Commit** `feat(shared): replace arcade physics port with a centred hitbox and momentum`.

### Task 6: Jump buffer and coyote time

**Files:**
- Modify: `packages/shared/src/simulation/player.ts`
- Test: `packages/shared/test/player.test.ts`

**Interfaces:**
- Consumes: `PlayerState.jumpBufferTicks`, `coyoteTicks`, `MOVEMENT.jumpBufferTicks`, `MOVEMENT.coyoteTicks`.
- Produces: no new exports; `stepPlayer` behaviour per spec steps 1, 2, 6 and 9.

- [ ] **Step 1: Write failing tests:**
  - `buffered press 6 ticks before landing jumps on landing`; `7 ticks before does not`. Find the landing tick with a dry run first, then press at `landing - 6` / `landing - 7`.
  - `coyote: jump pressed 6 ticks after walking off a ledge jumps`; `7 ticks after does not`.
  - `coyote is spent by the jump`: two presses after walking off, the second inside the old window, give one jump only.
  - `holding jump through a landing does not jump again`: one frame with `jumpPressed`, then `jumpPressed: false` for the rest; exactly one `jumped`.
  - `press while grounded jumps on the same tick` (no added latency).
- [ ] **Step 2: Run** `npx vitest run packages/shared/test/player.test.ts`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** in the jump helper and the timer helper.
- [ ] **Step 4: Run** `npm test`. Expected: PASS (prediction tests confirm the replay still matches).
- [ ] **Step 5: Commit** `feat(shared): add jump buffering and coyote time`.

### Task 7: Shot pose and animation from the new state

**Files:**
- Modify: `packages/shared/src/simulation/player.ts`
- Test: `packages/shared/test/player.test.ts`

**Interfaces:**
- Produces: `export function animationFor(p: PlayerState): AnimationKey`. It takes the post-step state; the input parameter goes away. Spec step 10. `shotPoseTicks` is set to `MOVEMENT.shotPoseTicks` only when a bullet fires.

- [ ] **Step 1: Write failing tests:**
  - `a shot shows the pose for exactly 12 ticks`: `anim === 'shoot'` on the firing tick and the 11 after it, then not.
  - `a press on cooldown shows no pose and fires nothing`.
  - `a press with no ammo shows no pose`.
  - `holding shoot does not fire again after the cooldown`: one press, then 120 ticks without one; exactly one bullet.
  - `anim reflects this tick`: the first jumping tick's result has `anim === 'jump'`, not `'idle'`.
  - `run while vx !== 0 on the floor, idle at 0`: during decel after release, anim stays `run` until `vx` reaches 0.
- [ ] **Step 2: Run** `npx vitest run packages/shared/test/player.test.ts`. Expected: new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(shared): show the shoot pose only when a bullet fires`.

### Task 8: Sprite placement in the client

**Files:**
- Modify: `packages/client/src/render/player-view.ts`

**Interfaces:**
- Consumes: `spriteCentre`, `SPRITE_OFFSET_X`, `SPRITE_OFFSET_Y` (Task 5).

The sprite is drawn at `spriteCentre(state, state.facing)`. The nickname label x follows `state.x`, the hitbox centre, so it does not jump on turn. Its y is `state.y + SPRITE_OFFSET_Y - NICKNAME_OFFSET_Y`, keeping the existing clamp and rounding.

- [ ] **Step 1: Implement** the placement above.
- [ ] **Step 2: Run** `npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 3: Visual check.** Use the `run` skill: start `npm run dev`, open two browser clients, start a match. Screenshot a player standing on a floor facing right, then facing left. The feet must sit on the tile top and the body art must stay over the same spot when turning. If the left-facing art sits 1 source px off, change `SPRITE_OFFSET_X.left` from `-5.5` (a true mirror, the original's offset 13) to `-4.5` (the original's offset 12). Record the chosen value and why in a comment.
- [ ] **Step 4: Commit** `feat(client): draw the player sprite relative to its hitbox`.

### Task 9: Keep presses on server queue overflow

**Files:**
- Modify: `packages/server/src/rooms/room.ts` (`queueInput`)
- Test: `packages/server/test/room.test.ts`

**Interfaces:**
- Consumes: `InputFrame.jumpPressed` / `shootPressed` (Task 4).
- Produces: overflow drops the oldest frame without a press. If every frame has one, it drops the oldest. A one-line private helper `hasPress(frame)`.

- [ ] **Step 1: Write the failing test** `queue overflow keeps a frame with a press`: start a match and queue frames 1-9 for `a`, with frame 1 `shootPressed: true` and the rest neutral (`INPUT_QUEUE_LIMIT` is 8). Tick once. `a`'s ammo is `STARTING_AMMO - 1` and the next snapshot's shots contain `a:1`.
- [ ] **Step 2: Run** `npx vitest run packages/server/test/room.test.ts`. Expected: FAIL (frame 1 was dropped).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `fix(server): never drop a key press when the input queue overflows`.

### Task 10: Docs and final verification

**Files:**
- Modify: `README.md`, `docs/superpowers/specs/2026-11-01-rewrite-design.md`

- [ ] **Step 1: Update docs.**
  - Rewrite spec: after the "Holding W re-jumps…" bullet, add `(Superseded by 2026-11-02-movement-feel-design.md: one press, one action.)`. Add the same note to the arcade body and parkour zone bullets (lines 56-57).
  - README: replace any mention of the Phaser 3.20 physics port with one sentence on `moveBox`, the tuning object and the corner assists.
  - Check that the how-to-play locale text does not mention holding keys.
- [ ] **Step 2: Run** `npm test && npm run typecheck && npm run lint && npm run build`. Expected: all PASS.
- [ ] **Step 3: Playtest** with two clients (`run` skill) across all three levels:
  - the portal is reachable on each level
  - turning at ledges never drops the player
  - near-miss ledges catch
  - one press gives one shot
  - level 1's top corridor is crossable (now easy, by decision)

  Report findings to the user and do not retune numbers without their say.
- [ ] **Step 4: Commit** `docs: describe the new movement model`.
