# Movement feel: design

Date: 2026-11-02
Status: approved

## Intent

The rewrite kept gameplay identical to the original, bugs and all. Players now hit three problems:

1. **Falling off a ledge just by turning around.** The hitbox slides sideways when the player turns.
2. **Missing a jump by one pixel.** Clipping a block corner with the head stops the jump. Reaching a ledge with the feet a few pixels below its top counts as hitting a wall. A jump pressed a few frames before landing, or a few frames after walking off an edge, is lost.
3. **"One press shoots twice."** Holding SPACE fires again after 1000 ms. The shoot pose shows whenever SPACE is held, even on cooldown when no bullet fires, so pose and bullets disagree.

This work replaces the ported Phaser 3.20 arcade physics with a small platformer controller built for fairness. All levels then play by the same rules. Speeds, gravity and jump height stay the same. Movement gains a little momentum.

Success: a player can turn at a ledge edge without falling. Near-miss jumps land. One press gives one jump or one shot. The game still feels like the same game.

## Goals

- One hitbox, the same in every level, that never moves when the player turns.
- Jump and shoot fire on the press, not while held.
- Jump buffering and coyote time.
- Corner correction for head bumps and for near-miss ledges.
- A little horizontal momentum: acceleration, deceleration, less grip in the air.
- Every feel number lives in one tuning object, so changing it is a one-line edit.
- Server and client prediction stay deterministic and identical: same shared step, same inputs, same result.

## Non-goals

- No change to run speed (270 px/s), gravity (1500 px/s²), jump velocity (-525 px/s), shot cooldown (1000 ms), ammo, bullet speed or levels' tile layouts.
- No short hop (releasing W early does not cut the jump).
- No new moves (wall jump, double jump, crouch, dash).
- No changes to netcode structure (tick rate, snapshots, interpolation, reconciliation model).

## Anti-goals

- The game must not feel floaty or slippery. "A little" momentum means a quick ramp, not a slide to plan around.
- Assists must not be visible as teleports. A corner nudge of a few pixels is fine. A jump that visibly snaps sideways by half a tile is not.
- Client prediction must not diverge from the server. Any state the step needs (buffers, timers) is part of `PlayerState` and travels in snapshots.

## Decisions (from the user)

- One press = one action. Holding W does not re-jump on landing. Holding SPACE does not auto-fire. This drops the original "hold to repeat" behaviour that the rewrite spec listed under "Details easy to miss".
- Jump presses are buffered for a short window. Coyote time allows a jump shortly after leaving a ledge.
- The parkour zone's narrow body is removed. Every level uses the same body and the same rules.
- Accepted consequence: level 1's top corridor stops being a challenge for now (see Levels). Making it hard again is level-design work for a later session, which will also bring a better way to create and edit levels. No tile edits in this work.
- Keep speeds, gravity and jump height. Add a little momentum, roughly:
  - ground: full speed in ~0.1 s, stop in ~0.07 s; turning around brakes first (a short skid);
  - air: full speed in ~0.15 s, stop in ~0.25 s when no direction is held.
- The numbers must be easy to tweak.

## Root causes found (for the record)

- `bodyBox` in `packages/shared/src/simulation/player.ts` uses offset x = 2 source px facing right and 12 facing left. At scale 2.3 the body jumps 23 px when turning (27.6 px with the narrow body). The sprite stays put; the physics box teleports.
- `nextNarrow` only restores the normal body when facing right. Leaving the parkour zone facing left keeps a 6.9 px wide body until the player faces right.
- `stepPlayer` jumps only if `onFloor` from the previous tick, with no grace window, and reads `input.jump` as a held key.
- `animationFor` returns `shoot` whenever `input.shoot && ammo > 0`, independent of whether a bullet fired. The anim is computed from the state before the tick, so it lags one tick.
- Tile separation is a port of Phaser 3.20 `SeparateTile` with `TILE_BIAS = 16`. Overlaps deeper than 16 px are ignored. A fall from the top of a level reaches ~19-22 px per tick, so a fast fall onto a one-tile platform can pass through it. The axis choice heuristic (`minX < minY`) is what turns near-corner contacts into wall hits.

## Design

### Tuning

A single exported, frozen object in `packages/shared/src/simulation/movement-tuning.ts` (name is the builder's call) holds every feel number with a doc comment and its unit. Authored in units a designer thinks in (ticks, pixels, px/s), not derived accelerations. Derived values (px/s per tick) are computed from it in one place.

Starting values (my call, tune in playtest):

| Field | Value | Meaning |
|---|---|---|
| `runSpeed` | 270 px/s | unchanged |
| `groundAccelTicks` | 6 | ticks from 0 to full speed on the ground |
| `groundDecelTicks` | 4 | ticks from full speed to 0 on the ground, also used to brake when reversing |
| `airAccelTicks` | 9 | same, in the air |
| `airDecelTicks` | 15 | ticks from full speed to 0 in the air with no direction held (drift). Reversing in the air brakes at the `airAccelTicks` rate instead, so a mid-jump turn is not slippery |
| `jumpBufferTicks` | 6 | a jump press is remembered this long (~100 ms) |
| `coyoteTicks` | 6 | a jump still works this long after leaving the ground (~100 ms) |
| `headNudgeMaxPx` | 12 | rising and the head clips a block by at most this much horizontally: slide sideways instead of stopping |
| `ledgeCatchMaxPx` | 8 | moving into a block whose top is at most this far above the feet, not rising: step up onto it |
| `shotPoseTicks` | 12 | how long the shoot pose shows after a bullet fires (~200 ms) |

Gravity, jump velocity, world size and shot cooldown stay in `constants.ts` as today. `RUN_SPEED` moves into the tuning object (or the tuning object re-exports it; builder's call, one source of truth).

Tiles are 32 × 30 px. `headNudgeMaxPx` should let a player get up through a one-tile (32 px) gap from a reasonable stance: the body is 27.6 px wide, so the gap leaves 4.4 px of slack, and a 12 px nudge each side makes the usable window ~28 px. No current route requires this, but future levels may. Builder verifies by test; see Verification.

### Input: presses, not holds

- `InputFrame` replaces `jump` and `shoot` with `jumpPressed` and `shootPressed`: true on the one frame the key went down. `left` and `right` stay held states.
- The client's `KeyboardInput` latches key-down events, so a tap shorter than one tick still produces one `jumpPressed` frame. One press yields exactly one frame with the flag set, even if Phaser runs several ticks in one render frame or none. Check the Phaser 4 keyboard API docs (phaser.io/oss/docs) before choosing between `Keyboard.JustDown`, key `down` events, or a manual latch.
- `parseInput` validates the new field names. Old field names are rejected (a stale client tab gets dropped inputs; the existing reconnect reload covers it).
- The server's starvation reuse already never repeats jump/shoot; it now synthesises `jumpPressed: false, shootPressed: false`.
- Queue overflow (my call): `Room.queueInput` drops the oldest frame when more than `INPUT_QUEUE_LIMIT` are queued. With held keys that was harmless; with presses it can drop a jump or shot the client already predicted (and whose bullet it already drew). Change the policy to drop the oldest frame that has no press, falling back to the oldest frame only if every queued frame has one. Seq numbers stay untouched, so bullet ids (`${playerId}:${seq}`) and own-bullet tracking keep working. Losing one tick of movement keys is corrected by reconciliation as today. This is a queue policy tweak, not a netcode structure change.

### Player state

`PlayerState` changes:

- Remove `narrow`.
- `x`, `y` become the **hitbox centre** (they are the sprite centre today). Rationale: the hitbox is the gameplay truth and must not move on turn; the sprite is drawn relative to it.
- Add `jumpBufferTicks: number` (ticks left on a buffered jump press, 0 when none).
- Add `coyoteTicks: number` (ticks left of coyote time, 0 when none).
- Add `shotPoseTicks: number` (ticks left of the shoot pose).
- `vx` now carries momentum between ticks (it already exists; today it is overwritten each tick).

All of these travel in snapshots, so reconciliation replays them exactly.

### Hitbox

- Size: 12 × 15 source px at `PLAYER_SCALE` 2.3, i.e. 27.6 × 34.5 world px. Same as today's normal body.
- Centred on `(x, y)`, independent of facing. `bodyBox(p)` takes only position.
- Bullets, pickups and the portal keep using `bodyBox`; their own rects are unchanged.

### Sprite placement (client only)

The art is not centred in its 27 × 23 frame. Facing right, today's body spans source px 2-14 horizontally and 8-23 vertically, so the frame centre sits at body centre + (5.5, -4) source px. Facing left, the sprite is mirrored, so the horizontal term flips sign.

- `PlayerView` draws the sprite at `(x + sign(facing) * 5.5 * PLAYER_SCALE, y - 4 * PLAYER_SCALE)`, sign +1 facing right, -1 facing left. Today's left offset (12) is one source px off a true mirror (13); builder confirms by eye which looks right with the art and records the chosen constant.
- The offset lives in one named constant pair shared by the view and any code that converts original sprite coordinates.
- The nickname label follows the hitbox centre, not the sprite, so it does not jump on turn.

### Converting original coordinates

Level spawns and the bullet muzzle were authored as sprite centres.

- Spawns: convert once in `createPlayer` via a small helper (sprite centre to hitbox centre, using the spawn's initial facing). Level data keeps the original numbers so they stay traceable to the original game.
- Bullet spawn: same world point as today, i.e. the sprite centre plus `BULLET_SPAWN_OFFSET_Y`, now computed from the hitbox centre and facing at the moment of the shot. Shots still leave from the gun, not from the body's middle.

### Collision

Delete the Phaser port: `arcade-body.ts`, `separate-tile.ts`, `collideWithTiles`, `TILE_BIAS`, and the face flags on tiles if nothing else needs them. `touchesSolidTile` (used by bullets) stays, moved if its module goes away.

New module, e.g. `packages/shared/src/physics/tile-collision.ts`, with a pure function that moves an axis-aligned box through the tile grid and reports contacts:

- Move X fully, resolve against solid tiles, then move Y fully, resolve. Each axis is swept so the box never passes through a tile however fast it moves: either step in increments no larger than the smallest tile dimension, or clamp the move to the first tile edge in the travel direction. Builder's choice.
- Resolution snaps the box flush to the tile edge and zeroes velocity on that axis.
- World bounds stay solid on all four sides, as today.
- Returns contacts `{ left, right, up, down }` (today's `blocked`). `down` drives `onFloor`.
- Tile edges between two solid tiles cause no snags: with axis-separated movement a box sliding along a flat floor never touches an internal vertical edge. This must be a test.

Corner correction is part of the move, not a separate pass:

- **Head nudge.** During the Y move, if the box is rising and hits solid tiles above, and the horizontal overlap with those tiles is at most `headNudgeMaxPx` from one side of the box, and shifting the box that far sideways (toward the open side) leaves it free, shift it and keep rising. Try the smaller shift first. Otherwise stop as normal.
- **Ledge catch.** During the X move, if the box is not rising (`vy >= 0`) and hits a solid tile whose top is at most `ledgeCatchMaxPx` above the box's bottom, and the box raised to sit on that top is free, raise it, keep horizontal velocity, and treat the player as landed.

Both assists read `headNudgeMaxPx` / `ledgeCatchMaxPx` from the tuning object.

### Step order

`stepPlayer(player, input, level)` stays pure and returns `{ player, bullet, jumped }`. New order:

1. Timers: shot cooldown clock, `shotPoseTicks`, `coyoteTicks`, `jumpBufferTicks` count down by one (not below 0).
2. Buffer: if `input.jumpPressed`, set `jumpBufferTicks = jumpBufferTicks` tuning value.
3. Facing: `left` held sets facing left (left wins over right, as today), `right` held sets facing right. Facing turns immediately, before momentum catches up.
4. Shoot: if `input.shootPressed`, ammo > 0 and cooled down, fire from the current facing, spend ammo, reset the cooldown and set `shotPoseTicks`. A press during cooldown or with no ammo does nothing and does not show the pose. No shot buffering (my call: a press 900 ms early firing later would feel wrong).
5. Horizontal velocity: move `vx` toward the target (`±runSpeed` or 0), never overshooting it. Rates:
   - direction held, same sign as `vx` (or `vx` is 0): accel rate (ground or air);
   - no direction held: decel rate (ground or air);
   - direction held opposite to `vx`: on the ground the ground decel rate (a quick skid), in the air the air accel rate (my call: the air decel rate would make a mid-jump turn take ~0.4 s). Once `vx` crosses 0 the accel rate applies.
6. Jump: if `jumpBufferTicks > 0` and (`onFloor` or `coyoteTicks > 0`), set `vy = JUMP_VELOCITY`, clear both `jumpBufferTicks` and `coyoteTicks`, report `jumped`.
7. Gravity: `vy += GRAVITY_Y * dt`.
8. Move and collide (above), including corner correction.
9. Ground bookkeeping: `onFloor` from the down contact. If the player was on the floor last tick, is not now, and did not jump this tick, set `coyoteTicks` to the tuning value. Landing clears `coyoteTicks`.
10. Animation from the *new* state: `shoot` while `shotPoseTicks > 0`; otherwise `idle`/`run` on the floor (`run` when `vx !== 0`) and `jump`/`fall` in the air by the sign of `vy`.

Jump buffering means a press while grounded fires on that same tick (buffer set in step 2, consumed in step 6), so there is no added latency.

The order above is the intent; the builder may reorder steps that do not interact if it reads better, and must document in the function why each order dependency exists.

### Code shape

- Keep `stepPlayer` short by delegating to small pure helpers, one per concern (timers, horizontal velocity, jump, shoot, animation). Each helper is unit-testable on its own.
- The collision module knows nothing about players: it moves a box with a velocity through a grid with given assist limits and returns the new box, velocity and contacts.
- No mutation of input state objects; same pure style as today.
- Comments explain why (feel rationale, order dependencies), not what.

### Levels

- Remove `ParkourZone`, `parkourZone` and its level config entries.
- No tile changes.
- What the narrow body actually did: in level 1 the zone covers the top corridor (rows 1-2, above row 3), whose floor has one-tile holes at columns 11, 13, 15, 17 between one-tile pillars (coins on the pillars). The 6.9 px body fell into those holes unless the player hopped pillar to pillar, and this corridor is on the only route to the portal. With the 27.6 px body and ledge catch the player walks straight across, the pillar coins become free, and players there are ~4× easier to hit. In level 2 the zone covers empty space, so only the hit size changes. The user accepted this; restoring the challenge is future level-design work.

### Docs

- Mark the rewrite spec's "Holding W re-jumps on every landing; holding SPACE fires every 1000 ms" as superseded by this design.
- README: update any description of physics being a Phaser 3.20 port and of the input frame fields.
- How-to-play text: check it does not mention holding keys (today it does not).

## Verification

Unit tests in `packages/shared/test` replace the Phaser-parity physics tests:

- Turning at a ledge edge, standing still, does not move the hitbox and does not fall.
- Walking off a ledge and pressing jump within `coyoteTicks` jumps; after it, does not.
- Pressing jump up to `jumpBufferTicks` before landing jumps on landing; earlier, does not.
- Holding jump through a landing does not jump again. Holding shoot through the cooldown does not fire again.
- One shot shows the pose for `shotPoseTicks`; a press on cooldown shows no pose.
- Jumping up into a one-tile gap with the body off-centre by up to `headNudgeMaxPx` passes through; further off stops.
- Moving into a ledge with the feet up to `ledgeCatchMaxPx` below its top lands on it; lower hits the wall.
- A long fall onto a one-tile platform lands on it (no tunnelling).
- Running along a flat multi-tile floor never stops (no internal-edge snags).
- Momentum: ground reaches `runSpeed` in `groundAccelTicks`, stops in `groundDecelTicks`; reversing brakes before accelerating.
- Determinism: replaying the same inputs from the same state gives identical states (existing prediction tests keep passing with the new fields).
- Spawn conversion: a freshly created player's sprite draw position equals the original spawn point.

Server and client tests that reference `narrow`, `jump`/`shoot` input fields or sprite-centre coordinates are updated, not deleted.

- Server: with a full queue, a frame carrying a press survives overflow; a press-less frame is dropped instead.

Manual playtest of all three levels with two clients: the routes to the portal remain reachable, the feel matches the anti-goals, and level 1's top corridor is crossable as expected (now easy, by decision).

## Left to the builder

- Module and helper names, file layout inside `packages/shared/src`.
- Sweep technique (substeps or edge clamping).
- Whether the sprite offset is 12 or 13 source px facing left (by eye).
- Final tuning values after playtest, within the spirit of "a little".
