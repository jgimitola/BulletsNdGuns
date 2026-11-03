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
import {
  attachSocketGateway,
  createSocketTransport,
  type GameServer,
  type GatewayDeps,
} from '../src/net/socket-gateway.ts';
import { NicknameRegistry } from '../src/nicknames/nickname-registry.ts';
import { Room, type PlaylistLevel } from '../src/rooms/room.ts';
import { MAX_ROOMS, RoomManager } from '../src/rooms/room-manager.ts';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

const CLASSIC: PlaylistLevel[] = [{ name: 'Classic 1', level: CLASSIC_PLAYLIST[0]! }];

let http: HttpServer;
let io: GameServer;
let rooms: RoomManager;
let client: Client;
/** What the gateway calls to load a new room's levels; each test sets its own. */
let loadPlaylist: GatewayDeps['loadPlaylist'];
let loads = 0;

beforeEach(async () => {
  loads = 0;
  loadPlaylist = async () => ({ ok: true, value: CLASSIC });
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
  attachSocketGateway(io, rooms, {
    registry: new NicknameRegistry({ isNicknameRegistered: async () => false }),
    // Every socket is the same signed-in account.
    sessionAccount: async () => ({ id: 'acc', nickname: 'Ana' }),
    loadPlaylist: (accountId, ids) => {
      loads++;
      return loadPlaylist(accountId, ids);
    },
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
  let finish: (playlist: PlaylistLevel[]) => void = () => {};
  let started: () => void = () => {};
  const loadStarted = new Promise<void>((resolve) => (started = resolve));
  loadPlaylist = () =>
    new Promise((resolve) => {
      finish = (value) => resolve({ ok: true, value });
      started();
    });
  client.emit('createRoom', { name: 'Sala' }, () => {});
  await loadStarted;
  const left = new Promise<void>((resolve) => {
    for (const socket of io.sockets.sockets.values()) socket.once('disconnect', () => resolve());
  });
  client.disconnect();
  await left;
  finish(CLASSIC);
  // Let the gateway's continuation run.
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(rooms.list()).toEqual([]);
});

test('a database error while loading levels answers serverError and the server lives on', async () => {
  loadPlaylist = () => Promise.reject(new Error('SQLITE_BUSY'));
  expect(await client.timeout(2000).emitWithAck('createRoom', { name: 'Sala' })).toEqual({
    ok: false,
    error: 'serverError',
  });
  expect(rooms.list()).toEqual([]);
  await expect(client.timeout(2000).emitWithAck('latency')).resolves.toBeUndefined();
});

test('a full server refuses a new room before loading any level', async () => {
  for (let i = 0; i < MAX_ROOMS; i++) rooms.create(`p${i}`, 'Sala', 'P', CLASSIC);
  expect(await client.timeout(2000).emitWithAck('createRoom', { name: 'Sala' })).toEqual({
    ok: false,
    error: 'tooManyRooms',
  });
  expect(loads).toBe(0);
});
