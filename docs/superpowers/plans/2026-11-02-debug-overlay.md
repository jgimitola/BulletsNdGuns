# Debug Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dev-only overlay, with layers chosen by `VITE_DEBUG`, that draws hitboxes, tiles, the server ghost, a trail, forces, jump timers and a draggable, collapsible readout panel over the game.

**Architecture:** The shared step reports a `StepTrace` (all four contacts, pre-collision acceleration, the corner assist fired) next to its existing results, without changing them. The client predictor passes the trace through and reports each reconcile's correction distance. Everything visual lives in `packages/client/src/debug/`. It loads by dynamic `import()` only when `import.meta.env.DEV && import.meta.env.VITE_DEBUG`, and is split into pure, tested model modules and two Phaser classes (world overlay, panel).

**Tech Stack:** TypeScript, Phaser 4 (`^4.2.1`), Vite, Vitest, npm workspaces.

**Spec:** `docs/superpowers/specs/2026-11-02-debug-overlay-design.md`

## Global Constraints

- `stepPlayer` returns the same `player`, `bullet` and `jumped` as before for the same inputs. Existing shared, server and client tests pass unchanged.
- Debug works only under `npm run dev`. A production build with `VITE_DEBUG=all` set emits no debug chunk.
- Layer names: `hitboxes`, `tiles`, `ghost`, `trail`, `forces`, `timers`, `panel`; `all` enables every one. Comma-separated, whitespace and case ignored.
- No change to network messages, snapshots or the server.
- Check Phaser 4 APIs at phaser.io/oss/docs (a local Phaser 4 source checkout is at `C:\Users\jesus\Documents\Proyectos\phaser`) before writing Phaser code; Phaser 4 changed APIs from 3.
- Code and comments in English. Comments explain why, not what, matching the existing style.
- Colours fixed by the spec: local hitbox green, remote hitboxes red, sprite frame dashed white, contacts thick cyan, server ghost grey dashed, velocity yellow, acceleration pink, assist markers cyan, trail green (floor) / orange (coyote) / blue (airborne).
- Verify each task with `npm test`, `npm run lint`, `npm run typecheck`.

## Review Focus

1. **Scene restart while the debug chunk is still loading.** The `import()` resolves after the level scene has shut down (fast level change). Expected: the stale overlay is never created and no Phaser object is added to a dead scene. Pinned in Task 6 Step 2 (session identity check), verified manually in Task 6 Step 6.
2. **Saved panel position outside the canvas, or corrupt `localStorage`.** Expected: the panel falls back to defaults or is clamped back inside the 800×600 canvas. Pinned by the `loadPanelPrefs` tests in Task 5.
3. **`VITE_DEBUG` containing only unknown names.** Expected: one warning, no layers, no overlay created. Pinned by the parser test in Task 4 and the `createDebugOverlay` null return in Task 6.
4. **Respawn or level reset arriving as a big reconcile jump.** Expected: shown as `reset`, kept out of the peak, and the trail cleared so it does not show a stale path at the old spot. Pinned by the `CorrectionMeter` and `Trail` tests in Task 5.
5. **Clicking the panel title to collapse it vs dragging it.** Expected: a drag never toggles collapse, and a click without movement always does. Verified manually in Task 7 Step 4. The toggle rule is a pure function with a test in Task 7.

---

### Task 1: `moveBox` reports which corner assist fired

**Files:**
- Modify: `packages/shared/src/physics/tile-collision.ts` (`MoveResult`, `moveBox`)
- Test: `packages/shared/test/tile-collision.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type CornerAssistEvent =
    | { kind: 'headNudge'; dx: number } // signed x shift applied, px
    | { kind: 'ledgeCatch'; dy: number }; // px the box was lifted, positive
  export interface MoveResult { box: Rect; vx: number; vy: number; contacts: Contacts; assist: CornerAssistEvent | null }
  ```

- [ ] **Step 1: Write the failing tests** in the existing `corner assists` describe blocks:
  - `head nudge` / `'reports the nudge'`: `rise(..., 10)` on the open grid gives `r.assist` `{ kind: 'headNudge', dx: closeTo(10, 6) }` (the box moves right from `gapLeft - 10` to `gapLeft`).
  - `head nudge` / `'beyond the limit reports no assist'`: `rise(..., 14)` gives `r.assist` `null`.
  - `ledge catch` / `'reports the lift'`: the existing 6 px case gives `r.assist` `{ kind: 'ledgeCatch', dy: closeTo(6, 6) }`.
  - `ledge catch` / `'a wall reports no assist'`: the 10 px case gives `null`.
  - In `describe('moveBox')`: a plain `step` across open space gives `assist: null`.
- [ ] **Step 2: Run** `npx vitest run packages/shared/test/tile-collision.test.ts`. Expected: the new tests FAIL (`assist` is undefined).
- [ ] **Step 3: Implement.** In `moveBox`, set `assist` where the `caught` branch is taken (`dy = box.y - caught.y`) and where `headNudge` returns non-null (`dx = nx - x.pos` before reassigning `x`); `null` otherwise.
- [ ] **Step 4: Run** `npm test`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat(shared): report the corner assist moveBox applied`.

### Task 2: `stepPlayer` returns a `StepTrace`

**Files:**
- Modify: `packages/shared/src/simulation/player.ts` (`move`, `PlayerStepResult`, `stepPlayer`)
- Test: `packages/shared/test/player.test.ts`

**Interfaces:**
- Consumes: `MoveResult.assist`, `CornerAssistEvent` (Task 1); `Contacts` (`tile-collision.ts`).
- Produces (exported from `player.ts`, so from `@bng/shared`):
  ```ts
  export interface StepTrace {
    contacts: Contacts;
    /** Velocity going into the move minus the velocity the tick started with: gravity, run accel, braking, jump. */
    accel: Vec2;
    assist: CornerAssistEvent | null;
  }
  export interface PlayerStepResult { player: PlayerState; bullet: BulletState | null; jumped: boolean; trace: StepTrace }
  ```

- [ ] **Step 1: Write the failing tests** (`describe('step trace')`), using the file's existing helpers (`standingAt`, `run`, `input`, `FLOOR_Y`, `LEFT_WALL_X`, `L1`):
  - `'standing reports the floor only'`: a settled player → `contacts` `{ left: false, right: false, up: false, down: true }`, `accel` `{ x: 0, y: closeTo(25, 9) }` (gravity `1500/60` per tick, removed by the floor afterwards).
  - `'walking into the left wall reports left'`: at `LEFT_WALL_X` holding `left` for 2 ticks → last trace `contacts.left` true.
  - `'a ground start reports run acceleration'`: standing, one tick with `right` → `accel.x` closeTo `MOVEMENT.runSpeed / MOVEMENT.groundAccelTicks`.
  - `'a jump tick reports the impulse plus gravity'`: standing, `jumpPressed` → `accel.y` closeTo `JUMP_VELOCITY + GRAVITY_Y / 60 - start.vy`.
  - `'free fall reports one tick of gravity'`: a player placed mid-air (`y = 100`, open column in level 1, checked with `vy` growing) → `accel.y` closeTo `25`.
  - `'a plain step reports no assist'`: standing still → `assist` `null`.
  - `'trace does not change the result'`: for a scripted 60-tick input sequence, `result.player` equals a replay of the same inputs (deep equal), confirming the trace is computed from, not fed into, the state.
- [ ] **Step 2: Run** `npx vitest run packages/shared/test/player.test.ts`. Expected: new tests FAIL.
- [ ] **Step 3: Implement.** `move` returns `{ player, contacts, assist }` from `moveBox`. In `stepPlayer`, capture `accel = { x: next.vx - player.vx, y: next.vy - player.vy }` right after step 7 (gravity), before step 8. Add `trace` to the returned result. `world.ts` needs no change.
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat(shared): stepPlayer reports contacts, acceleration and assists`.

### Task 3: Predictor passes the trace and measures corrections

**Files:**
- Modify: `packages/client/src/net/prediction.ts`
- Test: `packages/client/test/prediction.test.ts`

**Interfaces:**
- Consumes: `StepTrace` (Task 2).
- Produces:
  - `applyInput(keys): { frame: InputFrame; jumped: boolean; bullet: BulletState | null; trace: StepTrace }`
  - `reconcile(snapshot): number | null`: distance in px between the predicted hitbox centre before and after the reconcile; `null` when the snapshot was ignored (other level, local player absent).

- [ ] **Step 1: Write the failing tests:**
  - `'applyInput returns the step trace'`: after `applyInput(keys())` on a fresh setup, `trace.contacts` and `trace.accel` are defined and equal `stepPlayer(first, frame, level).trace`.
  - `'reconcile returns 0 when the server agrees'`: reuse the existing replay setup (server steps the same frames) → returns `0`.
  - `'reconcile returns the correction distance'`: server copy with `x + 3, y + 4` relative to what prediction had at that ack, no unacked frames → returns closeTo `5`.
  - `'reconcile of another level returns null'`.
- [ ] **Step 2: Run** `npx vitest run packages/client/test/prediction.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** with `Math.hypot` on the `x, y` delta of `this.current` before and after.
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS (`level-scene.ts` ignores the new return values for now).
- [ ] **Step 5: Commit** `feat(client): expose the step trace and reconcile corrections`.

### Task 4: `VITE_DEBUG` parsing and env plumbing

**Files:**
- Create: `packages/client/src/debug/layers.ts`
- Create: `packages/client/src/vite-env.d.ts`
- Modify: `.gitignore`, `.dockerignore`, `README.md`
- Test: `packages/client/test/debug-layers.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const DEBUG_LAYERS = ['hitboxes', 'tiles', 'ghost', 'trail', 'forces', 'timers', 'panel'] as const;
  export type DebugLayer = (typeof DEBUG_LAYERS)[number];
  export function parseDebugLayers(raw: string | undefined, warn?: (message: string) => void): ReadonlySet<DebugLayer>;
  ```
  `warn` defaults to `console.warn`.

- [ ] **Step 1: Write the failing tests:**
  - `undefined`, `''` and `' , '` → empty set, no warning.
  - `'all'` and `'ALL'` → all seven.
  - `' Hitboxes , trail '` → `{hitboxes, trail}`.
  - `'hitboxes,nope,zap'` → `{hitboxes}`, `warn` called once, its message contains `nope`, `zap` and every valid name.
  - `'nope'` → empty set, one warning.
- [ ] **Step 2: Run** `npx vitest run packages/client/test/debug-layers.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement `parseDebugLayers`.**
- [ ] **Step 4: Plumbing.**
  - `vite-env.d.ts`: `/// <reference types="vite/client" />` plus `interface ImportMetaEnv { readonly VITE_DEBUG?: string }`.
  - `.gitignore` and `.dockerignore`: add `.env*.local`.
  - `README.md`: a `Debug overlay` section after the scripts table: dev server only; the variable, the layer list with one line each (from the spec's Layers table); `$env:VITE_DEBUG='all'; npm run dev` (PowerShell), `VITE_DEBUG=hitboxes,panel npm run dev` (bash), or `VITE_DEBUG=...` in `packages/client/.env.local`; the panel drags by its title and collapses on click.
- [ ] **Step 5: Run** `npm test && npm run lint && npm run typecheck`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(client): parse VITE_DEBUG layer lists`.

### Task 5: Pure debug model

**Files:**
- Create: `packages/client/src/debug/correction-meter.ts`
- Create: `packages/client/src/debug/trail.ts`
- Create: `packages/client/src/debug/panel-text.ts`
- Create: `packages/client/src/debug/panel-prefs.ts`
- Test: `packages/client/test/debug-model.test.ts`

**Interfaces:**
- Consumes: `PlayerState`, `InputFrame`, `StepTrace`, `CornerAssistEvent`, `MOVEMENT`, `SHOT_COOLDOWN_MS`, `TICK_RATE` from `@bng/shared`.
- Produces:
  ```ts
  // correction-meter.ts
  export const CORRECTION_WINDOW_TICKS = 60;
  export const RESET_THRESHOLD_PX = 64;
  export class CorrectionMeter {
    record(distancePx: number): void;   // > RESET_THRESHOLD_PX counts as a reset, not a correction
    tick(): void;                        // advance one fixed step; entries older than the window drop
    get peakPx(): number;                // largest non-reset correction in the window, 0 if none
    get resetInWindow(): boolean;
  }
  // trail.ts
  export type TrailState = 'grounded' | 'coyote' | 'airborne';
  export const TRAIL_TICKS = 60;
  export function trailStateOf(p: PlayerState): TrailState;
  export interface TrailPoint { x: number; y: number; state: TrailState }
  export class Trail {
    push(p: PlayerState): void;          // keeps the newest TRAIL_TICKS
    clear(): void;
    get points(): readonly TrailPoint[]; // oldest first
  }
  export const ASSIST_MARKER_TICKS = 30;
  export interface AssistMarker { x: number; y: number; event: CornerAssistEvent; age: number }
  export class AssistMarkers {
    push(x: number, y: number, event: CornerAssistEvent): void;
    tick(): void;                        // ages markers, drops those at ASSIST_MARKER_TICKS
    get markers(): readonly AssistMarker[];
    get last(): AssistMarker | undefined; // most recent, even after it fades (for the panel)
  }
  // panel-text.ts
  export interface PanelData {
    state: PlayerState; input: InputFrame; trace: StepTrace;
    lastAssist: AssistMarker | undefined; unacked: number; peakPx: number; resetInWindow: boolean;
  }
  export function formatAssist(event: CornerAssistEvent): string;  // 'head nudge -4px', 'ledge catch +6px'
  export function formatPanel(d: PanelData): string[];
  // panel-prefs.ts
  export interface PanelPrefs { x: number; y: number; collapsed: boolean }
  export function loadPanelPrefs(storage: Pick<Storage, 'getItem'>, fallback: PanelPrefs, bounds: { width: number; height: number }): PanelPrefs;
  export function savePanelPrefs(storage: Pick<Storage, 'setItem'>, prefs: PanelPrefs): void;
  ```
  The storage key is `bng:debug-panel`.

- [ ] **Step 1: Write the failing tests:**
  - `CorrectionMeter`: record 1.5 and 3 → `peakPx` 3. After `CORRECTION_WINDOW_TICKS` ticks → 0. Record 200 → `peakPx` unchanged and `resetInWindow` true, false again after the window.
  - `trailStateOf`: `onFloor` → grounded; `!onFloor && coyoteTicks > 0` → coyote; otherwise airborne.
  - `Trail`: 70 pushes keep 60 with the oldest first; `clear` empties it.
  - `AssistMarkers`: a marker survives 29 ticks and is gone at 30; `last` is still set after it fades.
  - `formatAssist`: `{headNudge, dx: -4}` → `'head nudge -4px'`; `{ledgeCatch, dy: 6}` → `'ledge catch +6px'` (whole px, explicit sign).
  - `formatPanel` with a fixture matching the spec mockup (x 207, y 134.1, vx 270, vy 50, accel 0/25, not on floor, facing right, anim fall, coyote 4, jumpBuffer 0, shotPose 0, ticksSinceShot 34, input right only, no assist, unacked 7, peak 0) → exactly:
    ```
    pos   207.0, 134.1
    vel   270.0,  50.0
    accel  +0.0, +25.0 /tick
    floor no   facing R  anim fall
    touch L- R- U- D-
    coyote  ####.. 4/6
    jumpbuf ...... 0/6
    pose    0/12  cooldown 34/60
    input   R  -  -
    assist  none
    net     unacked 7  snap 0.0px
    ```
    Plus variants: touching floor → `touch L- R- U- DX`; cooldown over (`ticksSinceShot` > 60) → `cooldown ready`; input left + jump + shoot → `input   L  J  S`; an assist 12 ticks ago → `assist  ledge catch +6px (12 ticks ago)`; reset in window → `snap reset`. Bar lengths come from `MOVEMENT.coyoteTicks` / `MOVEMENT.jumpBufferTicks` / `MOVEMENT.shotPoseTicks`; the cooldown total is `SHOT_COOLDOWN_MS * TICK_RATE / 1000`.
  - `loadPanelPrefs`: missing key → fallback; invalid JSON → fallback; wrong types → fallback; `x: 5000` → clamped to `bounds.width - 1` at most (the panel module clamps fully once it knows its size); valid stored prefs → returned. `savePanelPrefs` then `loadPanelPrefs` round-trips.
- [ ] **Step 2: Run** `npx vitest run packages/client/test/debug-model.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the four modules.** `AssistMarker.age` counts ticks since the push; the panel's "ticks ago" is `age`.
- [ ] **Step 4: Run** `npm test && npm run lint && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(client): debug overlay model (trail, assists, corrections, panel text)`.

### Task 6: World overlay and scene wiring

**Files:**
- Create: `packages/client/src/debug/debug-overlay.ts`
- Modify: `packages/client/src/render/depth.ts` (add `debug: 9`, after `nicknames`)
- Modify: `packages/client/src/scenes/level-scene.ts`

**Interfaces:**
- Consumes: Tasks 3–5; `bodyBox`, `spriteCentre`, `bulletBox`, `coinRect`, `ammoPickupRect`, `portalRect`, `PLAYER_FRAME_WIDTH`, `PLAYER_FRAME_HEIGHT`, `PLAYER_SCALE`, `MOVEMENT`, `Level` from `@bng/shared`.
- Produces:
  ```ts
  export interface DebugView {
    local: PlayerState;
    remotes: readonly PlayerState[];
    bullets: readonly BulletState[];     // own + remote, as drawn this frame
    ammoPickupIds: readonly number[];
    coinIds: readonly number[];
    serverLocal: PlayerState | undefined; // local player in the latest snapshot
    unacked: number;
  }
  export class DebugOverlay {
    step(state: PlayerState, input: InputFrame, trace: StepTrace): void; // once per fixed tick
    correction(distancePx: number): void;                                // per non-null reconcile
    render(view: DebugView): void;                                       // once per render frame
    destroy(): void;
  }
  /** Parses import.meta.env.VITE_DEBUG; null when no layer is on. */
  export function createDebugOverlay(scene: Phaser.Scene, level: Level): DebugOverlay | null;
  ```
  `DebugOverlay` builds the panel from Task 7 when `panel` is on. Until Task 7 lands, skip that layer.

- [ ] **Step 1: Implement `debug-overlay.ts`.** One `Graphics` for the static `tiles` layer drawn in the constructor; one `Graphics` cleared and redrawn in `render` for everything else; a small pool of `Text` objects for coordinates, arrow labels and assist labels, hidden when unused. All at `Depth.debug`. Draw per the spec's Layers table and this plan's colour constraints. `step` feeds `Trail`, `AssistMarkers` (at the post-step hitbox centre), `CorrectionMeter.tick()`, and keeps the latest input and trace. `correction` feeds the meter; if the distance exceeds `RESET_THRESHOLD_PX`, also `trail.clear()`. Remote players get a floor contact line from `onFloor` only. Name the arrow scales as constants (velocity: px per px/s; acceleration: px per px/s-per-tick) so a 270 px/s arrow and a 25 px/s-per-tick arrow are both readable and neither crosses half the 800 px screen. Timer bars sit above the nickname label (`NICKNAME_OFFSET_Y` in `player-view.ts`; export it if needed) so they never cover it.
- [ ] **Step 2: Wire `level-scene.ts`.**
  - Add `debug: DebugOverlay | null` to `LevelSession` (initially `null`).
  - In `create`, after `this.session = session`: `if (import.meta.env.DEV && import.meta.env.VITE_DEBUG) void import('../debug/debug-overlay.ts').then((m) => { if (this.session !== session) return; session.debug = m.createDebugOverlay(this, level); });`. The identity check covers Review Focus 1. Destroy `session.debug` in the existing `SHUTDOWN` handler.
  - The `import type` of `DebugOverlay` is type-only, so it adds nothing to the bundle.
  - `step`: pass `frame`, the predicted state and `trace` from `applyInput` to `session.debug?.step(...)`.
  - The snapshot handler: `const px = session.predictor.reconcile(s); if (px !== null) session.debug?.correction(px);`.
  - `render`: after sampling, call `session.debug?.render({...})` with the predicted local state, the sampled remotes, `ownBullets.bullets` plus the sampled remote bullets, `sampled.latest` pickup ids, `sampled.latest.players.find(p => p.id === playerId)`, and `predictor.pending.length`. When `sampled` is null, skip the debug render too.
- [ ] **Step 3: Run** `npm test && npm run lint && npm run typecheck`. Expected: PASS.
- [ ] **Step 4: Build check.** Run `VITE_DEBUG=all npm run build` (bash) and list `packages/client/dist/assets`. Expected: no file containing `debug-overlay`, and `grep -rl "head nudge" packages/client/dist` finds nothing.
- [ ] **Step 5: Manual check** with `VITE_DEBUG=all npm run dev` and two browser tabs in one room (Playwright MCP or by hand; take screenshots):
  - Turning at a ledge edge: the hitbox stays put and the dashed frame flips.
  - Walking off a ledge: the trail turns orange and the coyote bar drains.
  - Jumping into a corner shows a cyan assist marker and label.
  - Standing still: the ghost overlaps the green box.
  - Only `VITE_DEBUG=tiles`: nothing else draws.
  - `VITE_DEBUG=nope`: one console warning, no overlay.
- [ ] **Step 6: Manual check, Review Focus 1:** finish a level (touch the portal) with `VITE_DEBUG=all`. Expected: the next level shows the overlay fresh, with no console errors.
- [ ] **Step 7: Commit** `feat(client): debug overlay world layers`.

### Task 7: Draggable, collapsible panel

**Files:**
- Create: `packages/client/src/debug/debug-panel.ts`
- Modify: `packages/client/src/debug/debug-overlay.ts` (build and update the panel when `panel` is on)
- Test: `packages/client/test/debug-model.test.ts` (toggle rule)

**Interfaces:**
- Consumes: `formatPanel`, `PanelData`, `loadPanelPrefs`, `savePanelPrefs` (Task 5).
- Produces:
  ```ts
  export const PANEL_TOGGLE_MAX_DRAG_PX = 4;
  /** A press-release on the title toggles collapse only if the pointer moved at most this far. */
  export function isTitleClick(downX: number, downY: number, upX: number, upY: number): boolean;
  export class DebugPanel {
    constructor(scene: Phaser.Scene, depth: number);
    update(data: PanelData): void;
    destroy(): void;
  }
  ```
  `isTitleClick` lives in `panel-prefs.ts` next to the other pure panel helpers, so the test imports nothing from Phaser.

- [ ] **Step 1: Write the failing test** for `isTitleClick`: (0,0)→(3,0) true; (0,0)→(0,4) true; (0,0)→(5,0) false.
- [ ] **Step 2: Implement `isTitleClick`, then `DebugPanel`.** A `Container` at `Depth.debug` holding a translucent dark background `Rectangle`, a title `Text` (`debug ▾` expanded, `debug ▸` collapsed) and a body `Text` (monospace, `formatPanel(...).join('\n')`). The title is interactive and draggable (check the Phaser 4 `setInteractive({ draggable: true })` / `drag` event API in the docs or the local source). Drag moves the container, clamped so the whole panel stays inside 800×600. Use `isTitleClick` on pointer down/up to toggle collapse; a collapsed panel hides the body and shrinks the background. Start from `loadPanelPrefs(localStorage, { x: 8, y: 600 - height - 8, collapsed: false }, { width: 800, height: 600 })` (bottom-left) and save on drag end and on toggle. Only rewrite the body text when the joined string changed, to avoid a texture update every frame.
- [ ] **Step 3: Run** `npm test && npm run lint && npm run typecheck`. Expected: PASS.
- [ ] **Step 4: Manual check** with `VITE_DEBUG=panel`:
  - Drag the panel to each edge: it stays inside the canvas.
  - A drag never collapses it; a click does.
  - Reload: position and collapsed state are kept.
  - Pressing W/A/D/SPACE while hovering the panel plays normally.
- [ ] **Step 5: Commit** `feat(client): draggable, collapsible debug panel`.
