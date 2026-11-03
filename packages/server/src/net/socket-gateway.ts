import type { IncomingHttpHeaders } from 'node:http';
import type { Server } from 'socket.io';
import {
  INPUT_RATE_LIMIT_FACTOR,
  TICK_RATE,
  parseClaimNickname,
  parseCreateRoom,
  parseInput,
  parseJoinRoom,
  type ClientToServerEvents,
  type NicknameAck,
  type RoomAck,
  type ServerToClientEvents,
} from '@bng/shared';
import type { SessionAccount } from '../auth/auth.ts';
import type { NicknameRegistry } from '../nicknames/nickname-registry.ts';
import type { RoomManager } from '../rooms/room-manager.ts';
import { rateLimiter } from './rate-limiter.ts';
import type { RoomTransport } from '../rooms/room.ts';

export interface SocketData {
  /** Set from the session cookie on connect; null for guests. */
  account: SessionAccount | null;
}

export type GameServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

export interface GatewayDeps {
  registry: NicknameRegistry;
  /** The signed-in account of a handshake; null for guests. Never throws. */
  sessionAccount(headers: IncomingHttpHeaders): Promise<SessionAccount | null>;
}

const RATE_WINDOW_MS = 1000;
/** A well-behaved client sends one input per tick; anything far above that is flooding. */
const MAX_INPUTS_PER_WINDOW = INPUT_RATE_LIMIT_FACTOR * TICK_RATE;
/** Create/join/leave/ready/claim come from button clicks; more than this per second is abuse. */
const MAX_ROOM_ACTIONS_PER_WINDOW = 10;
/** The client probes latency every couple of seconds; this leaves plenty of room. */
const MAX_LATENCY_PROBES_PER_WINDOW = 5;

/** Transport that delivers room messages to the socket whose id is the player id. */
export function createSocketTransport(io: GameServer): RoomTransport {
  return {
    send(playerId, event, ...args) {
      io.to(playerId).emit(event, ...args);
    },
  };
}

export function attachSocketGateway(io: GameServer, rooms: RoomManager, deps: GatewayDeps): void {
  const { registry } = deps;
  io.use((socket, next) => {
    deps.sessionAccount(socket.request.headers).then(
      (account) => {
        socket.data.account = account;
        next();
      },
      () => {
        socket.data.account = null;
        next();
      },
    );
  });
  io.on('connection', (socket) => {
    const account = socket.data.account;
    if (account) registry.connectAccount(socket.id, account.id, account.nickname);
    const inputRate = rateLimiter(MAX_INPUTS_PER_WINDOW, RATE_WINDOW_MS);
    const actionRate = rateLimiter(MAX_ROOM_ACTIONS_PER_WINDOW, RATE_WINDOW_MS);
    const latencyRate = rateLimiter(MAX_LATENCY_PROBES_PER_WINDOW, RATE_WINDOW_MS);
    const kick = (): void => {
      socket.disconnect(true);
    };
    /** Untrusted clients may omit the ack or send something else in its place. */
    const reply = (ack: unknown, result: RoomAck): void => {
      if (typeof ack === 'function') (ack as (result: RoomAck) => void)(result);
    };

    socket.on('claimNickname', (raw, ack) => {
      if (!actionRate.hit()) return kick();
      const answer = (result: NicknameAck): void => {
        if (typeof ack === 'function') (ack as (result: NicknameAck) => void)(result);
      };
      const request = parseClaimNickname(raw);
      // Accounts rename through their profile, so their name always matches the account's.
      if (!request || account) return answer({ ok: false, error: 'invalid' });
      void registry.claimGuest(socket.id, request.nickname).then((result) => {
        // The claim may finish after the socket left; it must not keep the name.
        if (socket.disconnected) registry.release(socket.id);
        else answer(result);
      });
    });
    socket.on('createRoom', (raw, ack) => {
      if (!actionRate.hit()) return kick();
      const request = parseCreateRoom(raw);
      if (!request) return reply(ack, { ok: false, error: 'invalid' });
      const nickname = registry.nicknameOf(socket.id);
      if (!account || nickname === null) return reply(ack, { ok: false, error: 'signInRequired' });
      reply(ack, rooms.create(socket.id, request.name, nickname));
    });
    socket.on('joinRoom', (raw, ack) => {
      if (!actionRate.hit()) return kick();
      const request = parseJoinRoom(raw);
      if (!request) return reply(ack, { ok: false, error: 'invalid' });
      const nickname = registry.nicknameOf(socket.id);
      if (nickname === null) return reply(ack, { ok: false, error: 'noNickname' });
      reply(ack, rooms.join(socket.id, request.roomId, nickname));
    });
    socket.on('leaveRoom', () => {
      if (!actionRate.hit()) return kick();
      rooms.leave(socket.id);
    });
    socket.on('ready', () => {
      if (!actionRate.hit()) return kick();
      rooms.roomOf(socket.id)?.markReady(socket.id);
    });
    socket.on('latency', (ack: unknown) => {
      if (!latencyRate.hit()) return kick();
      if (typeof ack === 'function') (ack as () => void)();
    });
    socket.on('input', (raw: unknown) => {
      if (!inputRate.hit()) return kick();
      const frame = parseInput(raw);
      if (frame) rooms.roomOf(socket.id)?.queueInput(socket.id, frame);
    });
    socket.on('disconnect', () => {
      rooms.leave(socket.id);
      registry.release(socket.id);
    });
  });
}
