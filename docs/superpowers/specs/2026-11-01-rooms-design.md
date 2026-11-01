# Nicknames and rooms: design

Date: 2026-11-01
Status: approved

## Intent

Today every visitor auto-joins one shared room. A visitor who arrives mid-match sees "match in progress" and can do nothing. Game over is a final screen. Players have no names.

This work adds:

1. A nickname, entered on the main menu and drawn above each player in game.
2. A room list (table) to find existing rooms.
3. A way to create rooms.
4. A match that drops to one player ends: the remaining player wins and the room closes.
5. On game over the room closes and players can go back to the main menu.

Gameplay (physics, controls, timings, levels, art, netcode) does not change.

## Decisions (from the user)

- Rule 4 applies only during a match. In the lobby the remaining player keeps waiting; a lobby closes when it is empty.
- Rule 5 closes only the room whose match ended. Other rooms keep playing.
- Creating a room asks for a name only. No player cap. A match starts when every player in the room pressed COMENZAR and there are at least 2, as today.
- Nickname: text field on the main menu, 1-12 characters, remembered in `localStorage`.
- Flow: main menu, then a room list screen, then a room lobby.
- The room table is fetched over HTTP (`GET /api/rooms`, TanStack Query). Everything about being in a room (lobby, match) stays on the socket.

## Flow

`CONECTANDO -> CARGANDO -> MENU -> SALAS -> SALA -> NIVEL -> RESULTADO -> MENU`

- **Menu**: nickname field, `JUGAR` (disabled until the nickname is valid), `CÓMO JUGAR`, credits.
- **Room list**: table `Nombre | Jugadores | Estado`. A room in its lobby has `UNIRSE`; a room playing shows `EN JUEGO`. Polled every 3 s plus an `ACTUALIZAR` button. `CREAR SALA` opens a dialog with a name field (default `Sala de <nick>`). `VOLVER` returns to the menu.
- **Room lobby**: room name, players with nickname and ready state, `COMENZAR` / `ESPERANDO`, `SALIR`.
- **Level**: HUD as today, plus each player's nickname above their sprite (own name gold, others white).
- **Result**: win/lose/tie, a line saying why the match ended when the rivals left, and `VOLVER AL MENÚ`.

## Protocol

Validation lives in `@bng/shared` so client and server agree: `parseNickname` (trimmed, 1-12 chars, no control characters) and `parseRoomName` (trimmed, 1-24 chars, same rule).

HTTP: `GET /api/rooms` returns `{ rooms: RoomSummary[] }`, `RoomSummary = { id, name, players, status: 'lobby' | 'playing' }`.

Socket, client to server:

- `createRoom({ name, nickname }, ack)`: creates a room and joins it in one step, so no empty room is ever listed.
- `joinRoom({ roomId, nickname }, ack)`.
- Both acks are `{ ok: true, lobby } | { ok: false, error }`, `error` one of `invalid | notFound | inProgress | alreadyInRoom | tooManyRooms`.
- `leaveRoom()`, `ready()`, `input(frame)` as today.

Socket, server to client:

- `lobbyUpdated(lobby)`, `lobby = { id, name, players: { id, nickname, ready }[] }`, on every join, leave and ready while in the lobby.
- `levelStarted({ levelIndex, snapshot, nicknames })`: `nicknames` maps player id to nickname. Names are not repeated in every snapshot.
- `snapshot` as today.
- `matchEnded({ scores, reason })`, `reason` is `completed | rivalsLeft`.
- `joined` and `matchInProgress` are removed.

## Server

- `RoomManager` creates rooms with server-generated ids, lists them, finds the room a player is in, and removes closed rooms. At most 50 rooms.
- `Room` phases: `lobby | playing | closed`. A room closes when its lobby empties, when its last level is completed, or when a match drops to one player. Closing stops the tick loop and tells the manager, which forgets the room and its players.
- The gateway no longer joins anyone on connect. Room operations are rate-limited.

## Client

- The Phaser game is created on the first socket `connect`. A reconnect still reloads the page (the server has forgotten the player).
- The level scene releases its key captures (W/A/D/SPACE) on shutdown, so text fields work again after a match.
- The menu scene waits for `levelStarted` from both the menu and the lobby. After the result, `VOLVER AL MENÚ` restarts the menu scene.
- The match-in-progress screen and its locale keys are removed: in-progress rooms are simply not joinable.
- Vite's dev proxy forwards `/api` to the server.

## Non-goals

- No passwords, private rooms, player caps, kicking, host role or chat.
- No reconnecting into a running match.
- No persistent accounts; the nickname is only in `localStorage`.
- No unique-nickname enforcement.
