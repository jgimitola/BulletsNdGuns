import type { Server } from 'socket.io';
import {
  INPUT_RATE_LIMIT_FACTOR,
  TICK_RATE,
  parseInput,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@bng/shared';
import type { RoomManager } from '../rooms/room-manager.ts';
import type { RoomTransport } from '../rooms/room.ts';

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;

const RATE_WINDOW_MS = 1000;
/** A well-behaved client sends one input per tick; anything far above that is flooding. */
const MAX_INPUTS_PER_WINDOW = INPUT_RATE_LIMIT_FACTOR * TICK_RATE;

/** Transport that delivers room messages to the socket whose id is the player id. */
export function createSocketTransport(io: GameServer): RoomTransport {
  return {
    send(playerId, event, ...args) {
      io.to(playerId).emit(event, ...args);
    },
  };
}

/** Counts events in a rolling window; `hit()` returns false once the limit is exceeded. */
function rateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const times: number[] = [];
  return {
    hit(): boolean {
      const t = now();
      while (times.length > 0 && (times[0] as number) <= t - windowMs) times.shift();
      times.push(t);
      return times.length <= limit;
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
    const inputRate = rateLimiter(MAX_INPUTS_PER_WINDOW, RATE_WINDOW_MS);
    socket.on('ready', () => room.markReady(socket.id));
    socket.on('input', (raw: unknown) => {
      if (!inputRate.hit()) {
        socket.disconnect(true);
        return;
      }
      const frame = parseInput(raw);
      if (frame) room.queueInput(socket.id, frame);
    });
    socket.on('disconnect', () => room.leave(socket.id));
  });
}
