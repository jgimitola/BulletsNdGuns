# BulletsNdGuns

A small multiplayer 2D platformer-shooter. Players race through three levels collecting as many coins as they can. Shooting rivals sends them back to their spawn point and slows them down. Touching the portal at the top of a level moves everyone to the next one, and after the last portal the game ends and each player sees whether they won, lost or tied.

Originally a university project (Data Structures course) by Jesús Imitola, Santiago Guerrero and Julio Mendoza, rewritten as a server-authoritative TypeScript codebase. The original JavaScript lives in the `archive/original` branch.

## Requirements

- Node 24 (see `.nvmrc`)

## Scripts

| Command             | What it does                                                      |
| ------------------- | ----------------------------------------------------------------- |
| `npm ci`            | Install dependencies for all workspaces                           |
| `npm run dev`       | Game server (watch mode) plus Vite dev server for the client      |
| `npm test`          | Run all Vitest suites                                             |
| `npm run build`     | Build the client into `packages/client/dist`                      |
| `npm start`         | Run the server, which also serves the built client                |
| `npm run lint`      | ESLint                                                            |
| `npm run typecheck` | `tsc --noEmit` in every package                                   |
| `npm run format`    | Prettier                                                          |

### Debug overlay

`npm run dev` can draw the simulation over the game. Set `VITE_DEBUG` to a comma-separated list of layers, or `all`:

| Layer      | Shows                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------- |
| `hitboxes` | Player hitboxes, sprite frames, centres, `x, y`, contact sides, bullet/pickup/portal rects  |
| `tiles`    | An outline on every solid tile                                                               |
| `ghost`    | Where the latest server snapshot has your player                                             |
| `trail`    | Your last second of positions: green on the floor, orange in coyote time, blue in the air   |
| `forces`   | Velocity and this tick's acceleration as arrows; markers where a corner assist fired         |
| `timers`   | Coyote and jump-buffer bars above your player                                                |
| `panel`    | A readout of position, velocity, contacts, timers, input and netcode                         |

```sh
$env:VITE_DEBUG='all'; npm run dev          # PowerShell
VITE_DEBUG=hitboxes,panel npm run dev       # bash
```

Or put `VITE_DEBUG=...` in `packages/client/.env.local` (git-ignored). The panel drags by its title bar and collapses when the title is clicked. Production builds never include the overlay.

Production: `npm run build && npm start`. Environment: `PORT` (default 3000), `CLIENT_DIST` (default `packages/client/dist`). `GET /healthz` returns `{"status":"ok"}`.

The client build is split so the first screen only needs our entry code, React and a small vendor chunk. Phaser and the scenes (`src/game.ts`) start downloading at page load but are only booted once the socket connects, and the room list (with TanStack Query) is fetched when the menu shows. The build also writes `.br` and `.gz` copies of text files; the server sends those to browsers that accept them and falls back to the original file otherwise.

Docker:

```sh
docker build -t bulletsndguns .
docker run -p 3000:3000 bulletsndguns
```

The server and shared code run as TypeScript directly through Node 24 type stripping, so there is no server build step.

## Architecture

npm workspaces monorepo:

- `packages/shared`: pure TypeScript, no Phaser or Node APIs. Fixed-step physics (`moveBox`: swept per-axis tile collision with corner assists, head nudge and ledge catch, tuned from the single `MOVEMENT` object), the simulation (`step(state, inputs, dt)`), the level registry (Tiled maps, spawns, pickups, portal) and the network protocol types.
- `packages/server`: Express 5 (static client, `/healthz`, `/api/rooms`), Socket.io wiring, and the `Room` / `RoomManager` that own matches.
- `packages/client`: Phaser 4 renderer, Vite build, input, networking and i18n.

### From key press to snapshot

1. The client samples the keyboard each tick and sends `{ seq, level, left, right, jumpPressed, shootPressed }` (`level` lets the server drop frames still in flight when the level changes). It also applies the input immediately to its own copy of the simulation (prediction).
2. The server queues inputs per player and applies one per 60 Hz tick, running the same shared `step` function. Movement, shooting, hits, pickups, portals and the winner are decided only here.
3. The server broadcasts snapshots about 20 to 30 times per second, including each player's last processed input `seq`.
4. The local client resets to the server state and replays unacknowledged inputs (reconciliation). Remote players and bullets are drawn about 100 ms in the past, interpolated between snapshots.
5. One-off events arrive in two ways. Level changes (`levelStarted`) and the end of the match (`matchEnded`) are their own messages. Shots ride on the next snapshot: its `shots` list holds every bullet fired since the previous snapshot, even one that has already hit something, and the client plays the shot sound once per remote shot id (its own shots sound when it predicts them). Pickups and hits have no message of their own: the client sees them as state changes (a pickup id missing from the snapshot, a player back at its spawn), and a remote player who jumps more than 64 px between snapshots is drawn at the new position instead of gliding there.

### Rooms

A `Room` owns one match (players with nicknames, simulation state, phase: lobby, playing, closed). `RoomManager` holds every open room (at most 50) and which room each player is in.

- Nobody is in a room on connect. The room table polls `GET /api/rooms` (`{ rooms: [{ id, name, players, status }] }`).
- `createRoom` and `joinRoom` socket events (with an ack) put a player in a room; `leaveRoom` takes them out. While in the lobby every change is pushed as `lobbyUpdated`. The match starts when everyone is ready and there are at least 2 players.
- A room closes when its lobby empties, when its last level is finished, or when its match drops to one player (who wins). `matchEnded` carries the reason (`completed` or `rivalsLeft`), and players go back to the menu from the result screen.

## Language

Player-facing text goes through `packages/client/src/i18n` and ships in Spanish (`es`) and English (`en`). The main menu has an ES / EN switch; the choice is saved in `localStorage`. With no saved choice the browser language decides, falling back to Spanish. To add a locale:

1. Add `packages/client/src/i18n/locales/<code>.ts` typed as `Record<keyof typeof es, string>`, so a missing key fails the typecheck.
2. Register it in `LOCALES` and `locales` in `packages/client/src/i18n/index.ts`, and add a `language.<code>` key to every locale.
3. All UI text lives in the locale files; there are no text-bearing images.

## Tooling note

TypeScript is pinned to 6.0.3. typescript-eslint 8.72.x supports TypeScript below 6.1, and TypeScript 7 is out but not yet supported by the linter. Bump the pin once typescript-eslint supports it.

## Authors

Jesús Imitola, Santiago Guerrero, Julio Mendoza.
