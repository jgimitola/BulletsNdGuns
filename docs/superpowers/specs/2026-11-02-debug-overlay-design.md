# Debug overlay: design

Date: 2026-11-02
Status: approved

## Intent

The movement-feel work (docs/superpowers/specs/2026-11-02-movement-feel-design.md) fixed problems that were hard to diagnose by playing: the hitbox sliding on turn, lost jumps at ledges, no coyote time. The rules now involve invisible state: a centred hitbox offset from the art, coyote and jump-buffer windows of a few ticks, momentum, and corner assists that nudge the player a few pixels.

The user wants to see that state while playing, so the next "why did I fall / why didn't I jump" can be answered by looking instead of guessing.

Success: with debug turned on, a developer can watch the hitbox, contacts, velocity, acceleration, timers and assists of their own player in real time and tell why a movement outcome happened.

## Goals

- Draw the simulation's real collision shapes over the game: player hitboxes, bullets, pickups, the portal and solid tiles.
- Show the local player's forces and timers: velocity, this tick's acceleration, contacts, coyote and jump-buffer windows, shot cooldown, shoot pose, and corner assists.
- Show where the server last placed the local player, and how far reconciliation corrected the prediction.
- Each piece is a separate layer, switched on by an env var.

## Non-goals

- No pause, frame step or slow motion. The user ruled all three out.
- No runtime toggling with keys. Layers are chosen only by the env var, at startup.
- No server-side debug output and no change to network messages or snapshots.
- No debug detail for other players beyond what snapshots already carry (see Layers).
- No level editing tools (that is a separate, later session).

## Anti-goals

- Debug must not change gameplay. `stepPlayer` stays pure and deterministic and gives the same `player`, `bullet` and `jumped` with or without debug on. Server and client keep running the same step.
- With no debug env var set, the production bundle must not contain the debug code, and normal play must not pay for it.
- The overlay must not hide the thing being debugged. Shapes are outlines or translucent fills, not solid blocks over the player.

## Decisions (from the user)

- Hitbox view: option C from the mockups, i.e. everything spatial: player hitboxes, sprite frames, centre dots, contacts, bullet and pickup rects, solid tile outlines, a server ghost, and coordinates next to each player.
- Forces view: a trail of past positions coloured by state, a velocity arrow, an acceleration arrow, and markers when a corner assist fires.
- Placement: the two short jump timers (coyote, jump buffer) as bars above the player; the full readout in a corner panel.
- Hitboxes and forces are done together in this one piece of work.
- Individual layers, selected only by env var.
- The panel stays inside the game and can be dragged and collapsed, so it can be moved off whatever is being tested.

## Design

### Turning it on

One Vite env var, read at build/dev-server start:

```
VITE_DEBUG=hitboxes,tiles,ghost,trail,forces,timers,panel
VITE_DEBUG=all
```

- Comma-separated layer names, whitespace and case ignored. `all` enables every layer. Unset or empty means debug is off.
- Unknown names log one `console.warn` listing the valid ones; the known names in the list still apply.
- The parser is a small pure function (env string to a set of layers) with unit tests in `packages/client/test`.
- Works from the shell (`$env:VITE_DEBUG='all'; npm run dev` in PowerShell, `VITE_DEBUG=all npm run dev` in bash) or from `packages/client/.env.local`. Add `.env*.local` to `.gitignore` so a personal debug setting is never committed. (My call.)
- Debug is for the dev server only (`npm run dev`); a production build (`npm run build`, Docker) never includes it, whatever `VITE_DEBUG` says. The user runs locally, and Vite reads `.env.local` in production builds too, so a forgotten debug line must not reach a deployed image. (My call.)
- The debug code lives in its own module(s) under `packages/client/src/debug/` and is reached by a dynamic `import()` guarded by `import.meta.env.DEV && import.meta.env.VITE_DEBUG`. In a production build `DEV` is the constant `false`, the branch is dead, and the chunk is not emitted. The builder confirms by checking `npm run build` output for the absence of a debug chunk, with `VITE_DEBUG=all` set.
- Also add `.env*.local` to `.dockerignore`, so personal settings never enter the image build context.

### Layers

| Layer | Draws | Who |
|---|---|---|
| `hitboxes` | Hitbox (`bodyBox`) as an outline with a light fill, green for the local player, red for others. Dashed white sprite frame (`spriteCentre` and the frame size at `PLAYER_SCALE`). A dot at the hitbox centre. `x, y` (one decimal) next to each player. Contact sides drawn thick in cyan. Outlines on bullet rects (`bulletBox`), live coin and ammo pickup rects (`coinRect`, `ammoPickupRect`) and the portal rect (`portalRect`). | Local player: all four contacts from the step trace. Others: only the floor side, from `onFloor` in the snapshot. Bullets: own (predicted) and remote (interpolated), each at the position they are drawn. |
| `tiles` | A thin outline on every solid tile of the level grid. Static, drawn once. | Level |
| `ghost` | A grey dashed box at the local player's hitbox from the latest snapshot. | Local player |
| `trail` | The local player's hitbox centre for the last 60 ticks (1 s), one dot per tick, coloured: green on the floor, orange in coyote time (`coyoteTicks > 0` and not on the floor), blue airborne. | Local player |
| `forces` | Yellow arrow for velocity `(vx, vy)`. Pink arrow for this tick's acceleration (see Step trace). Each labelled with its values. A cyan marker where a corner assist fired, labelled with its kind and distance (e.g. `ledge catch +6px`, `head nudge -4px`), fading over about half a second. | Local player |
| `timers` | Two small bars above the player: coyote and jump buffer, each filled by ticks left over its `MOVEMENT` maximum. | Local player |
| `panel` | Monospace text block fixed to a screen corner. Contents below. | Local player |

Everything about the local player reads the predicted state (what is drawn), not the server's. Other players use the interpolated state their sprites are drawn from.

Panel contents, one item per line, mirroring the mockup:

```
pos   207.0, 134.1
vel   270.0,  50.0
accel  +0.0, +25.0 /tick
floor no   facing R  anim fall
touch L- R- U- D-
coyote  ####.. 4/6
jumpbuf ...... 0/6
pose    0/12  cooldown 34/60
input   R  -  -          (left/right held, jump pressed, shoot pressed)
assist  none             (or the last one, with how many ticks ago)
net     unacked 7  snap 0.0px
```

`unacked` is the number of inputs the server has not acknowledged (`LocalPlayerPredictor.pending.length`). `snap` is the real measure of prediction error: the distance between the predicted hitbox centre just before and just after a `reconcile`. Snapshots arrive at 20 Hz and almost every reconcile corrects nothing, so the latest value alone would read 0.0 nearly always. The panel shows the largest correction over the last second (60 ticks) instead. A correction larger than two tiles (64 px) is not a misprediction but a respawn or level reset arriving; it is shown as `reset` and kept out of the peak. (My call.) Cooldown counts ticks since the last shot against the cooldown in ticks.

The ghost is not a divergence indicator on its own. The latest snapshot is about one round trip behind the prediction, so while moving the ghost trails the green box. At rest they should overlap. `snap` is the number that says whether prediction and server disagree.

### Step trace (shared)

The step currently drops information the overlay needs. `stepPlayer` gains one more field on its result:

```ts
interface PlayerStepResult {
  player: PlayerState;
  bullet: BulletState | null;
  jumped: boolean;
  trace: StepTrace;
}
```

`StepTrace` (name is the builder's call) carries:

- `contacts`: all four sides from `moveBox`, not only `down`.
- `accel`: the velocity change this tick before collision, i.e. velocity going into the move minus the velocity the tick started with. That covers gravity, run acceleration, braking and the jump impulse. A collision zeroing an axis shows up in `contacts`, not as acceleration.
- `assist`: `null`, or which corner assist fired this tick and the distance it moved the box (`headNudge` with a signed x shift, `ledgeCatch` with the lift in px). `moveBox` returns this in its `MoveResult`; it already knows when it takes either branch.

Rules:

- The trace never feeds back into the state. `player`, `bullet` and `jumped` are identical to today for the same inputs; existing tests prove it by passing unchanged.
- The server ignores `trace`. It is cheap (a few numbers per tick per player), so it is always computed rather than switched on, keeping one code path. (My call.)
- `LocalPlayerPredictor.applyInput` returns the trace alongside `jumped` and `bullet`. Replays in `reconcile` discard theirs, as they already discard events.
- `reconcile` records the `snap` distance described above, for the panel.

### Client wiring

- `LevelScene` creates the debug overlay only when at least one layer is on, passing it the level, and calls it once per fixed step (state, input frame, trace) and once per render (local predicted state, interpolated remote players, bullets, live pickups, latest snapshot, predictor counters).
- The overlay owns its Phaser objects (graphics and text) and destroys them on scene shutdown, like the other views.
- A new `Depth.debug` above everything, including nicknames.
- The trail and assist markers are fed per fixed step, not per render frame, so they show ticks, which is the unit the timers are tuned in.
- The panel lives inside the game canvas (Phaser), not in the page around it: a resized window does not guarantee any margin beside the 4:3 stage. Translucent dark background.
- The world is a fixed 800×600 screen and every level has a spawn in both bottom corners, so no spot is free. The panel is therefore **draggable** and **collapsible** (user's decision):
  - A title bar (e.g. `debug ▾`) is the drag handle; dragging moves the whole panel, kept inside the canvas.
  - Clicking the title bar toggles between the full readout and collapsed (title bar only). Builder's call whether collapsed shows a one-line summary.
  - Mouse only. The game uses only W/A/D/SPACE, so this cannot interfere with play.
  - Starts expanded in the bottom-left corner. Position and collapsed state are remembered in `localStorage` so they survive reloads and level changes. (My call.)
  - Check the Phaser 4 input/drag API at phaser.io/oss/docs before building; Phaser 4 changed APIs from 3.
- Arrow scales are named constants in the debug module, chosen so a full-speed run arrow and a gravity-tick arrow are both readable without crossing half the screen. Builder's call on the values.

### Docs

- README: a short "Debug overlay" section with the env var, the layer names and the PowerShell and bash examples.

## Verification

Unit tests:

- Env parser: unset/empty is off; `all`; a list; mixed case and spaces; unknown names warn and are skipped.
- Step trace in `packages/shared/test`: contacts report each side (walk into a wall, land, hit a ceiling); `accel.y` equals one tick of gravity while falling freely; a jump tick reports the jump impulse plus gravity; a ground start reports the run acceleration; a head nudge and a ledge catch each report their kind and distance; a plain move reports `assist: null`.
- Existing shared, client and server tests pass unchanged (proves the trace does not change gameplay).

Build check: `npm run build` with `VITE_DEBUG=all` set emits no debug chunk.

Predictor: a unit test that a respawn-sized correction reads as `reset` and does not enter the peak, and that the peak drops after 60 ticks.

Manual: drag the panel to each edge (it stays inside the canvas), collapse and expand it, reload and check both are remembered. Run with `VITE_DEBUG=all`, two clients, and check each layer by eye on a level: turn at a ledge edge (hitbox stays, sprite frame flips), walk off a ledge (trail goes orange, coyote bar drains), jump into a corner (assist marker), shoot (pose and cooldown in the panel). Then run with a single layer to check others stay off.

## Left to the builder

- Module, class and type names; how the debug code is split into files.
- Colours other than those fixed above, line widths, fonts, exact bar and label placement (bars must not cover the nickname).
- Arrow scale constants.
