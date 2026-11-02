# BulletsNdGuns rewrite: design

Date: 2026-11-01
Status: draft, awaiting approval

## Intent

BulletsNdGuns is a small 2D multiplayer platformer-shooter built years ago as a university project (Phaser 3.20, Socket.io 2, Express 4, plain JavaScript). Players collect coins across three levels while shooting each other to slow rivals down; whoever touches a level's portal first moves everyone to the next level, and after the last portal the player with the most coins wins.

The goal is to rewrite the **code only**: a modern, typed, cleanly structured codebase that is easy to understand and maintain, with the server as the single source of truth so the game can no longer be cheated from the browser. Players must not be able to tell the difference: same look, same sounds, same levels, same controls, same timings, same feel.

The rewrite is also the foundation for later work, chiefly multiple rooms with a room listing. That work is out of scope here, but the architecture must make it a small addition rather than a rewrite.

## Goals

1. Server-authoritative game. Clients send only inputs (key states). The server runs the simulation (movement, gravity, tile collision, bullets, hits, pickups, ammo, score, portals, level changes, winner) and broadcasts state.
2. Client-side prediction for the local player and interpolation for remote players, so movement feels as responsive as today on a normal connection.
3. TypeScript everywhere, latest library versions, clear module boundaries, small files.
4. All code in English: identifiers, comments, file names, asset file names, message names, README.
5. Player-facing text stays Spanish, served through a small i18n layer so other languages can be added later.
6. Runs locally with one command; ready to deploy (single production process, `PORT` env var, Dockerfile).
7. Original code preserved in the `archive/original` branch.

## Non-goals

- No gameplay, UI, art, sound or level changes.
- No rooms/lobby/room listing yet (only structure that makes them easy).
- No accounts, persistence, leaderboards.
- No actual deployment.
- No new art for other languages.

## Anti-goals (failure even if it "works")

- The game feels different: floatier/heavier jumps, different speeds, hitboxes that don't match, input lag on a local connection.
- Any game outcome still decided by a client (a modified client can teleport, hit, collect, or end a level at will).
- Duplicated per-level code, like the three near-identical scenes today.
- Over-engineering: patterns or layers that exist for their own sake. A newcomer should be able to follow a shot from key press to respawn in a few minutes.

## Constraints

- Stack (latest at time of writing): Phaser 4.2, TypeScript 7, Socket.io 4.8 (server + client), Express 5, Vite 8, Vitest 5, Node 24. If a tool in the chain is not yet compatible with TypeScript 7 (e.g. linting), the builder may pin the newest compatible TypeScript and note it.
- Express stays (decided by the user) because rooms, listing endpoints and similar HTTP features are planned. HTTP setup lives in its own module, separate from game logic.
- Existing assets and Tiled maps are reused as-is (files may be renamed to English; Tiled internal names such as the `Plataformas` layer and `p1LevelTS` tileset may stay, referenced through constants).

## Current behaviour to preserve

Extracted from the original code (`archive/original`). The rewrite must reproduce these numbers and behaviours.

### World and rendering
- Canvas 800x600, `pixelArt: true`, horizontally centered, no scale mode. `disableWebAudio: true` (keep unless it blocks Phaser 4).
- Maps are 25x20 tiles of 32x30 px. Collision: every non-empty tile in the `Plataformas` layer is solid. All three maps share the `p1LevelTS` tileset image.
- Level background colour `rgb(250, 143, 67)`.

### Player
- Sprite sheet frames 27x23, drawn at scale 2.3, origin centre.
- Arcade body: size 12x15, offset (2, 8) facing right; offset (12, 8) when flipped (facing left). These are Phaser arcade values on a scaled sprite, so the effective world-space box must be computed the way Phaser 3 arcade does (the builder must verify the numbers against the original running game, e.g. by logging `body.x/y/width/height` in the archive build). (Superseded by 2026-11-02-movement-feel-design.md: one fixed, centred hitbox in every level.)
- "Parkour zone" in levels 1 and 2 only: while `256 < x < 576` and `y < 90`, body width becomes 3 with offset (6, 8) facing right or (18, 8) facing left. (Superseded by 2026-11-02-movement-feel-design.md: parkour zone removed; every level uses the same body.)
- Gravity 1500 px/s² downward. Horizontal speed 270 px/s. Jump velocity -525 px/s, only when on the floor. Player collides with world bounds. (Superseded by 2026-11-02-movement-feel-design.md: jump buffer and coyote time, so a jump also works shortly before landing or after leaving a ledge.)
- Controls: `A` left (takes priority over `D`), `D` right, neither = stop instantly (no acceleration). (Superseded by 2026-11-02-movement-feel-design.md: light momentum, see `MOVEMENT`.) `W` jump. `SPACE` shoot. Moving left sets facing left; moving right sets facing right.
- Animations: idle frame 7; run frames 0-5 at 6 fps; jump frame 9 (rising); fall frame 10 (falling); shoot frame 8. Shoot animation shows while `SPACE` is held and ammo > 0; otherwise on floor: idle if not moving horizontally, run if moving; in air: jump if rising, fall if falling. Remote players use the enemy sprite sheet with the same frames. (Superseded by 2026-11-02-movement-feel-design.md for the shoot pose: it shows only when a bullet fires, for `MOVEMENT.shotPoseTicks`.)

### Spawns
- Players alternate between two sides by join order:
  - Side A (facing right): level 1 (13, 514), level 2 (96, 546), level 3 (64, 540).
  - Side B (facing left): level 1 (803, 514), level 2 (709, 543), level 3 (736, 540).
- Being hit sends the victim back to the current level's spawn point. Nothing else changes (no coin loss).

### Shooting
- Ammo starts at 2 at the start of **each** level.
- Cooldown 1000 ms between shots. Each shot costs 1 ammo.
- Bullet spawns at (player.x, player.y + 5), moves horizontally at 600 px/s in the facing direction, no gravity. Bullet sprite is 4x4 drawn at scale 1.5.
- A bullet is removed when it hits a solid tile, leaves the screen horizontally (x < 0 or x > 800), or hits a player.
- A bullet hitting another player respawns that player. The shot sound (volume 0.15) plays for every shot, local or remote.

### Pickups
- Positions come from `coleccionables.json` (per level: ammo `balas1/2/f`, coins `monedas1/2/f`). Each is drawn with origin (0, 0) at (x, y - 30). Ammo body 10x30, coin body 25x23.
- Touching ammo: +1 ammo. Touching a coin: +1 score. Either way the pickup disappears for everyone.
- Score (coins) carries across levels.

### Portals
- Portal image 64x60, body width 44 (image width - 20). Positions: level 1 (704, 60), level 2 (32, 60), level 3 (416, 60).
- The first player to touch the portal ends the level for everyone. Level 3's portal ends the match.

### Match flow
- On load: loading screen (progress bar, percentage, asset name), then the menu.
- Menu: background, title, "Jugar" button with hover image and hover sound (volume 0.2), "Cómo jugar" button with hover image showing a popup closed by clicking it, info icon (top right) showing credits closed by clicking them. Clicking "Jugar" replaces the button with the animated "waiting" sprite (2 fps) and marks the player ready.
- Match starts when at least 2 players are connected and all are ready. All players go to level 1.
- HUD in each level: `Munición: N` at (2, 0), `Monedas: N` at (2, 12), default Phaser text style.
- Game over screen: if the top score is shared and the local player has it, `EMPATADO` (white); else if the local player has the top score, `GANASTE` (green `#00ff0d`); else `PERDISTE` (red `#ff0000`). 32 px, centred.
- While a match is running, new visitors see the "match in progress" page: blue `rgb(0, 212, 255)` background, title image, the two Spanish messages. The match resets when every player has disconnected.
- A player who disconnects disappears for everyone. If one player remains mid-match, the match continues.
- The game over screen stays until the player reloads; there is no "play again" (unchanged).
- Jump sound volume 0.15.

### Details easy to miss
- Holding `W` re-jumps on every landing; holding `SPACE` fires every 1000 ms while ammo lasts. (Superseded by 2026-11-02-movement-feel-design.md: one press, one action.)
- Players do not collide with each other; they pass through.
- No player limit (none today).
- In-flight bullets do not carry over to the next level.

### Original bugs that are fixed, not preserved
These are side effects of the client-authoritative design; fixing them is expected:
- Remote bullets vanish instantly on other screens (they overlap the shooter). A bullet must never hit its own shooter and must be visible to everyone.
- Remote players are drawn horizontally offset from their real position.
- A socket connecting just as a match starts is added to the running match. Joins during a match are refused at the socket level.
- When players disconnect, the remaining player can end up starting a match alone. Start requires at least 2 players.
- If the local shot pool is empty, ammo is spent without a bullet. Every spent ammo produces a bullet.

## Architecture (decided)

### Repository layout

npm workspaces monorepo:

```
package.json            workspaces, root scripts (dev, build, start, test, lint)
tsconfig.base.json
Dockerfile
packages/
  shared/               pure TypeScript, no Phaser, no Node APIs
    src/
      physics/          fixed-step AABB vs tile grid, gravity, bodies
      simulation/       world state, step(state, inputs, dt) -> state; rules
      levels/           level registry: map JSON, spawns, portal, pickups
      protocol/         message types, snapshot/input shapes, constants
  server/
    src/
      http/             Express 5 app (static files, future REST)
      net/              Socket.io wiring, typed events
      rooms/            Room, RoomManager, match state machine
      index.ts          composition root
  client/
    index.html
    public/assets/      textures, sounds (English file names)
    src/
      scenes/           Boot/Loader, Menu, Level (one, data-driven), GameOver, MatchInProgress
      net/              socket client, snapshot buffer, prediction/reconciliation
      render/           sprite views of players, bullets, pickups, portal
      input/            keyboard to input commands
      i18n/             locales/es.ts + t() helper + locale-aware asset keys
      main.ts
```

Level data (Tiled maps and pickup positions) lives in `shared` so server and client load the same files.

### Server authority and netcode

- **Fixed-step simulation** in `shared/simulation`, a pure function of (state, inputs, dt). Runs at 60 Hz on the server. The client runs the same code for prediction, so predicted and authoritative results match.
- **Custom physics** in `shared/physics` replaces Phaser arcade for gameplay: axis-separated AABB movement against the tile grid, matching the original numbers above. Phaser on the client renders only; it does not simulate.
- **Inputs:** each client tick sends `{ seq, left, right, jump, shoot }`. The server queues per player, applies one input per tick, and ignores malformed or excessive input (rate-limit to roughly one input per tick).
- **Snapshots:** the server broadcasts world state about 20-30 times per second, including each player's last processed input `seq`.
- **Local player:** predict immediately; on snapshot, reset to the server state and replay unacknowledged inputs (reconciliation).
- **Remote players and bullets:** render about 100 ms in the past, interpolating between snapshots.
- **Events** (shot fired, pickup taken, player hit, level changed, match over) are sent as discrete messages or snapshot events so sounds and animations trigger once.

### Rooms

- `Room` owns one match: players, simulation state, phase, tick loop.
- `RoomManager` owns rooms. For now it creates a single default room that every connection joins. Rooms and listing later = more rooms + a lobby API, with no simulation changes.

### Patterns (only where they pay)

- **State machine** for the room phase: `Lobby -> Playing(level) -> GameOver`, resetting to `Lobby` when everyone leaves.
- **Command** for inputs: input frames are data, queued and applied by the simulation.
- **Registry** for levels: an ordered list of level configs replaces per-level classes; "next level" is the next entry.
- **Typed events** for networking: Socket.io's generic event maps, shared between client and server.
- **Functional core, imperative shell:** simulation and rules are pure and unit-tested; I/O (sockets, timers, Phaser) wraps them.

### HTTP

- Express 5 serves the built client in production and is where future REST endpoints (rooms listing) go.
- Development: Vite dev server for the client with `/socket.io` proxied to the game server; `tsx watch` (or equivalent) for the server.
- Production: `npm run build && npm start` runs one Node process serving the client and sockets on `PORT` (default 3000). Multi-stage Dockerfile on Node 24.
- Unknown routes go to `/`, as today.

### i18n

- `client/src/i18n/locales/es.ts` holds every on-screen string (loading text, HUD labels, game over results, match in progress messages). Code uses `t('hud.ammo', { count })`-style keys.
- Images that contain text (title, buttons, popup, credits, waiting sprite) are loaded through a locale-aware asset key so other locales can provide their own files later.
- Only `es` exists; it is the default.

### Quality

- Vitest unit tests for `shared` (physics numbers such as jump apex and run speed, collisions, shooting/cooldown/ammo, pickups, hits/respawn, portal and level progression, winner/tie logic) and for `Room` (phases, joins refused mid-match, disconnects).
- At least one integration test: a server plus two socket clients play through a scripted scenario (ready, move, shoot, hit, portal).
- ESLint + Prettier, strict TypeScript.
- README rewritten in English: what the game is, how to run, dev, test, build, architecture overview.

## Left to the builder

- Exact snapshot rate, interpolation delay and input buffering, within the feel constraints.
- Snapshot encoding (plain JSON is fine to start).
- Choice of server dev runner and server build tool.
- Internal module and type names beyond the layout above.
- How to verify feel parity (recommended: run `archive/original` and the rewrite side by side, compare jump height, run speed, hitbox sizes and bullet travel numerically).
- Whether `coleccionables.json` data moves into the level registry as TypeScript or stays JSON (renamed to English).
