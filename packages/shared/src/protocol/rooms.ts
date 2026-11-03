import { z } from 'zod';
import type { PlayerId } from '../simulation/player.ts';
import { parseWith } from '../validation.ts';

export const NICKNAME_MAX_LENGTH = 12;
export const ROOM_NAME_MAX_LENGTH = 24;

export type RoomId = string;
export type RoomStatus = 'lobby' | 'playing';

/** One row of the room table (`GET /api/rooms`). */
export interface RoomSummary {
  id: RoomId;
  name: string;
  players: number;
  status: RoomStatus;
}

export interface LobbyPlayer {
  id: PlayerId;
  nickname: string;
  ready: boolean;
}

/** What a player in a room's lobby sees. */
export interface RoomLobby {
  id: RoomId;
  name: string;
  players: LobbyPlayer[];
}

export type RoomError = 'invalid' | 'notFound' | 'inProgress' | 'alreadyInRoom' | 'tooManyRooms';

export type RoomAck = { ok: true; lobby: RoomLobby } | { ok: false; error: RoomError };

export interface CreateRoomRequest {
  name: string;
  nickname: string;
}

export interface JoinRoomRequest {
  roomId: RoomId;
  nickname: string;
}

// C0 and C1 control characters, which would render as nothing or break the layout.
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

/** Trimmed text of 1..maxLength characters without control characters. */
function labelSchema(maxLength: number) {
  return z
    .string()
    .trim()
    .refine((text) => {
      // Count code points so an emoji is one character, as the player sees it.
      const length = [...text].length;
      return length >= 1 && length <= maxLength && !CONTROL_CHARS.test(text);
    });
}

export const nicknameSchema = labelSchema(NICKNAME_MAX_LENGTH);
export const roomNameSchema = labelSchema(ROOM_NAME_MAX_LENGTH);

export const createRoomSchema = z.object({
  name: roomNameSchema,
  nickname: nicknameSchema,
}) satisfies z.ZodType<CreateRoomRequest>;

export const joinRoomSchema = z.object({
  roomId: z.string().min(1).max(64),
  nickname: nicknameSchema,
}) satisfies z.ZodType<JoinRoomRequest>;

export function parseNickname(raw: unknown): string | null {
  return parseWith(nicknameSchema, raw);
}

export function parseRoomName(raw: unknown): string | null {
  return parseWith(roomNameSchema, raw);
}

/** Validates an untrusted `createRoom` payload. Returns a fresh request, or null. Never throws. */
export function parseCreateRoom(raw: unknown): CreateRoomRequest | null {
  return parseWith(createRoomSchema, raw);
}

/** Validates an untrusted `joinRoom` payload. Returns a fresh request, or null. Never throws. */
export function parseJoinRoom(raw: unknown): JoinRoomRequest | null {
  return parseWith(joinRoomSchema, raw);
}
