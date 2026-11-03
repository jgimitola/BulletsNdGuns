import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { MAX_SOCKET_MESSAGE_BYTES } from '@bng/shared';
import { toNodeHandler } from 'better-auth/node';
import { kyselyAccountDirectory } from './auth/account-directory.ts';
import { createAuth } from './auth/auth.ts';
import { loadConfig, type ServerConfig } from './config.ts';
import { openDatabase } from './db/database.ts';
import { migrateGameTables } from './db/migrations.ts';
import { createApp } from './http/create-app.ts';
import { allowedOrigins, isAllowedOrigin } from './http/origins.ts';
import { levelsRouter } from './http/levels-routes.ts';
import { kyselyLevelStore } from './levels/kysely-level-store.ts';
import { LevelService } from './levels/level-service.ts';
import {
  attachSocketGateway,
  createSocketTransport,
  type GameServer,
} from './net/socket-gateway.ts';
import { NicknameRegistry } from './nicknames/nickname-registry.ts';
import { Room } from './rooms/room.ts';
import { RoomManager } from './rooms/room-manager.ts';
import { TickLoop } from './rooms/tick-loop.ts';

export async function startServer(
  config: ServerConfig,
): Promise<{ port: number; close(): Promise<void> }> {
  const db = openDatabase(config.databasePath);
  const registry = new NicknameRegistry(kyselyAccountDirectory(db));
  const auth = await createAuth(db, config, {
    // `io` exists by the time anyone can register: requests only arrive after listen().
    nicknameChanged: (accountId, nickname) => {
      for (const revoked of registry.accountNicknameChanged(accountId, nickname)) {
        io.to(revoked.socketId).emit('nicknameRevoked', revoked.nickname);
      }
    },
  });
  await migrateGameTables(db);
  const levels = new LevelService(kyselyLevelStore(db));
  await levels.seedBuiltins();
  // `rooms` is only read once requests arrive, after it is assigned below.
  const httpServer = createServer(
    createApp(config, {
      listRooms: () => rooms.list(),
      authHandler: toNodeHandler(auth.handler),
      levelsRouter: levelsRouter(levels, (headers) => auth.sessionAccount(headers)),
    }),
  );
  const origins = allowedOrigins(config);
  const io: GameServer = new Server(httpServer, {
    maxHttpBufferSize: MAX_SOCKET_MESSAGE_BYTES,
    // The handshake carries the session cookie: another site's page must not open a socket as the player.
    allowRequest: (req, callback) => callback(null, isAllowedOrigin(req.headers.origin, origins)),
  });
  const transport = createSocketTransport(io);
  // Loops of open rooms only: a room drops its own when it closes.
  const loops = new Set<TickLoop>();
  const rooms = new RoomManager(({ id, name, playlist, onClosed }) => {
    const loop = new TickLoop();
    loops.add(loop);
    return new Room({
      id,
      name,
      playlist,
      transport,
      scheduler: loop,
      onClosed: (room) => {
        loops.delete(loop);
        onClosed?.(room);
      },
    });
  });
  attachSocketGateway(io, rooms, {
    loadPlaylist: (accountId, ids) => levels.loadPlaylist(accountId, ids),
    registry,
    sessionAccount: (headers) => auth.sessionAccount(headers),
  });

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
