import type { Server } from 'socket.io';
import { parseInput, type ClientToServerEvents, type ServerToClientEvents } from '@bng/shared';
import type { RoomManager } from '../rooms/room-manager.ts';
import type { RoomTransport } from '../rooms/room.ts';

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;

/** Transport that delivers room messages to the socket whose id is the player id. */
export function createSocketTransport(io: GameServer): RoomTransport {
  return {
    send(playerId, event, ...args) {
      io.to(playerId).emit(event, ...args);
    },
  };
}

export function attachSocketGateway(io: GameServer, rooms: RoomManager): void {
  io.on('connection', (socket) => {
    const room = rooms.defaultRoom();
    if (room.join(socket.id) === 'refused') {
      socket.emit('matchInProgress');
      socket.disconnect(true);
      return;
    }
    socket.emit('joined');
    socket.on('ready', () => room.markReady(socket.id));
    socket.on('input', (raw: unknown) => {
      const frame = parseInput(raw);
      if (frame) room.queueInput(socket.id, frame);
    });
    socket.on('disconnect', () => room.leave(socket.id));
  });
}
