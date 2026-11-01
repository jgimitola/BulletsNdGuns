import type { Server } from 'socket.io';
import {
  INPUT_RATE_LIMIT_FACTOR,
  TICK_RATE,
  parseCreateRoom,
  parseInput,
  parseJoinRoom,
  type ClientToServerEvents,
  type RoomAck,
  type ServerToClientEvents,
} from '@bng/shared';
import type { RoomManager } from '../rooms/room-manager.ts';
import type { RoomTransport } from '../rooms/room.ts';

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;

const RATE_WINDOW_MS = 1000;
/** A well-behaved client sends one input per tick; anything far above that is flooding. */
const MAX_INPUTS_PER_WINDOW = INPUT_RATE_LIMIT_FACTOR * TICK_RATE;
/** Create/join/leave/ready come from button clicks; more than this per second is abuse. */
const MAX_ROOM_ACTIONS_PER_WINDOW = 10;

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
    const inputRate = rateLimiter(MAX_INPUTS_PER_WINDOW, RATE_WINDOW_MS);
    const actionRate = rateLimiter(MAX_ROOM_ACTIONS_PER_WINDOW, RATE_WINDOW_MS);
    const kick = (): void => {
      socket.disconnect(true);
    };
    /** Untrusted clients may omit the ack or send something else in its place. */
    const reply = (ack: unknown, result: RoomAck): void => {
      if (typeof ack === 'function') (ack as (result: RoomAck) => void)(result);
    };

    socket.on('createRoom', (raw, ack) => {
      if (!actionRate.hit()) return kick();
      const request = parseCreateRoom(raw);
      reply(
        ack,
        request
          ? rooms.create(socket.id, request.name, request.nickname)
          : { ok: false, error: 'invalid' },
      );
    });
    socket.on('joinRoom', (raw, ack) => {
      if (!actionRate.hit()) return kick();
      const request = parseJoinRoom(raw);
      reply(
        ack,
        request
          ? rooms.join(socket.id, request.roomId, request.nickname)
          : { ok: false, error: 'invalid' },
      );
    });
    socket.on('leaveRoom', () => {
      if (!actionRate.hit()) return kick();
      rooms.leave(socket.id);
    });
    socket.on('ready', () => {
      if (!actionRate.hit()) return kick();
      rooms.roomOf(socket.id)?.markReady(socket.id);
    });
    socket.on('input', (raw: unknown) => {
      if (!inputRate.hit()) return kick();
      const frame = parseInput(raw);
      if (frame) rooms.roomOf(socket.id)?.queueInput(socket.id, frame);
    });
    socket.on('disconnect', () => rooms.leave(socket.id));
  });
}
