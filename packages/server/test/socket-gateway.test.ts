import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { Server } from 'socket.io';
import { io as connect, type Socket } from 'socket.io-client';
import {
  CLASSIC_PLAYLIST,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@bng/shared';
import type { ServiceResult } from '../src/levels/level-service.ts';
import {
  attachSocketGateway,
  createSocketTransport,
  type GameServer,
} from '../src/net/socket-gateway.ts';
import { NicknameRegistry } from '../src/nicknames/nickname-registry.ts';
import { Room, type PlaylistLevel } from '../src/rooms/room.ts';
import { RoomManager } from '../src/rooms/room-manager.ts';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let http: HttpServer;
let io: GameServer;
let rooms: RoomManager;
let client: Client;
/** Resolves the playlist load the gateway is waiting on. */
let finishLoad: (result: ServiceResult<PlaylistLevel[]>) => void = () => {};
let loadStarted: Promise<void>;

beforeEach(async () => {
  http = createServer();
  io = new Server(http);
  const transport = createSocketTransport(io);
  rooms = new RoomManager(
    ({ id, name, playlist, onClosed }) =>
      new Room({
        id,
        name,
        playlist,
        transport,
        scheduler: { start() {}, stop() {} },
        onClosed,
      }),
  );
  let started: () => void = () => {};
  loadStarted = new Promise((resolve) => (started = resolve));
  attachSocketGateway(io, rooms, {
    registry: new NicknameRegistry({ isNicknameRegistered: async () => false }),
    // Every socket is the same signed-in account.
    sessionAccount: async () => ({ id: 'acc', nickname: 'Ana' }),
    loadPlaylist: () =>
      new Promise((resolve) => {
        finishLoad = resolve;
        started();
      }),
  });
  await new Promise<void>((resolve) => http.listen(0, resolve));
  const { port } = http.address() as AddressInfo;
  client = connect(`http://localhost:${port}`, { transports: ['websocket'], forceNew: true });
  await new Promise<void>((resolve) => client.once('connect', () => resolve()));
});

afterEach(async () => {
  client.disconnect();
  await io.close();
});

test('a creator who disconnects while the levels load leaves no room behind', async () => {
  client.emit('createRoom', { name: 'Sala' }, () => {});
  await loadStarted;
  const left = new Promise<void>((resolve) => {
    for (const socket of io.sockets.sockets.values()) socket.once('disconnect', () => resolve());
  });
  client.disconnect();
  await left;
  finishLoad({ ok: true, value: [{ name: 'Classic 1', level: CLASSIC_PLAYLIST[0]! }] });
  // Let the gateway's continuation run.
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(rooms.list()).toEqual([]);
});
