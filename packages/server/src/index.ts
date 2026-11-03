import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import {
  CLASSIC_PLAYLIST,
  MAX_SOCKET_MESSAGE_BYTES,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@bng/shared';
import { toNodeHandler } from 'better-auth/node';
import { createAuth } from './auth/auth.ts';
import { loadConfig, type ServerConfig } from './config.ts';
import { openDatabase } from './db/database.ts';
import { createApp } from './http/create-app.ts';
import { attachSocketGateway, createSocketTransport } from './net/socket-gateway.ts';
import { Room } from './rooms/room.ts';
import { RoomManager } from './rooms/room-manager.ts';
import { TickLoop } from './rooms/tick-loop.ts';

export async function startServer(
  config: ServerConfig,
): Promise<{ port: number; close(): Promise<void> }> {
  const db = openDatabase(config.databasePath);
  const auth = await createAuth(db, config, {
    nicknameChanged: () => {},
  });
  // `rooms` is only read once requests arrive, after it is assigned below.
  const httpServer = createServer(
    createApp(config, { listRooms: () => rooms.list(), authHandler: toNodeHandler(auth.handler) }),
  );
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    maxHttpBufferSize: MAX_SOCKET_MESSAGE_BYTES,
  });
  const transport = createSocketTransport(io);
  // Loops of open rooms only: a room drops its own when it closes.
  const loops = new Set<TickLoop>();
  const rooms = new RoomManager(({ id, name, onClosed }) => {
    const loop = new TickLoop();
    loops.add(loop);
    return new Room({
      id,
      name,
      playlist: CLASSIC_PLAYLIST,
      transport,
      scheduler: loop,
      onClosed: (room) => {
        loops.delete(loop);
        onClosed?.(room);
      },
    });
  });
  attachSocketGateway(io, rooms);

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(config.port, () => {
      httpServer.off('error', reject);
      resolve();
    });
  });
  const port = (httpServer.address() as AddressInfo).port;

  return {
    port,
    async close() {
      for (const loop of loops) loop.stop();
      await io.close(); // also closes the underlying http server
      await db.close();
    },
  };
}

if (import.meta.main) {
  const server = await startServer(loadConfig());
  console.log(`BulletsNdGuns server listening on :${server.port}`);
  const shutdown = (signal: NodeJS.Signals): void => {
    console.log(`${signal} received, shutting down`);
    server.close().then(
      () => process.exit(0),
      (err: unknown) => {
        console.error(err);
        process.exit(1);
      },
    );
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
