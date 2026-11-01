import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@bng/shared';
import { loadConfig, type ServerConfig } from './config.ts';
import { createApp } from './http/create-app.ts';
import { attachSocketGateway, createSocketTransport } from './net/socket-gateway.ts';
import { Room } from './rooms/room.ts';
import { RoomManager } from './rooms/room-manager.ts';
import { TickLoop } from './rooms/tick-loop.ts';

export async function startServer(
  config: ServerConfig,
): Promise<{ port: number; close(): Promise<void> }> {
  const httpServer = createServer(createApp(config));
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer);
  const loops: TickLoop[] = [];
  const transport = createSocketTransport(io);
  const rooms = new RoomManager((id) => {
    const loop = new TickLoop();
    loops.push(loop);
    return new Room(id, transport, loop);
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
    },
  };
}

if (import.meta.main) {
  const { port } = await startServer(loadConfig());
  console.log(`BulletsNdGuns server listening on :${port}`);
}
