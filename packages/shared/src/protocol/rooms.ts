import { z } from 'zod';
import type { PlayerId } from '../simulation/player.ts';
import { parseWith } from '../validation.ts';
import { INVISIBLE, labelSchema } from './labels.ts';
import { levelIdSchema, MAX_PLAYLIST_LENGTH, type LevelId } from './levels.ts';

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
  /** The playlist's level names, in play order. */
  levels: string[];
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
  /** The playlist's level names, in play order. */
  levels: string[];
}

/**
 * `signInRequired`: guests can't create rooms. `noNickname`: a guest must claim a nickname (again,
 * after losing it to an account) before joining.
 */
export type RoomError =
  | 'invalid'
  | 'notFound'
  | 'inProgress'
  | 'alreadyInRoom'
  | 'tooManyRooms'
  | 'signInRequired'
  | 'noNickname'
  | 'levelUnavailable'
  | 'serverError';

/** Why a guest could not claim a nickname. */
export type NicknameError = 'invalid' | 'taken';

export type RoomAck = { ok: true; lobby: RoomLobby } | { ok: false; error: RoomError };

export type NicknameAck = { ok: true; nickname: string } | { ok: false; error: NicknameError };

/** The player's nickname is the one they claimed (guests) or their account's, never the request's. */
export interface CreateRoomRequest {
  name: string;
  /** The playlist, in order; the server plays its default playlist when absent. */
  levelIds?: LevelId[];
}

export interface JoinRoomRequest {
  roomId: RoomId;
}

export interface ClaimNicknameRequest {
  nickname: string;
}

export const nicknameSchema = labelSchema(NICKNAME_MAX_LENGTH);
export const roomNameSchema = labelSchema(ROOM_NAME_MAX_LENGTH);

export const createRoomSchema = z.object({
  name: roomNameSchema,
  levelIds: z.array(levelIdSchema).min(1).max(MAX_PLAYLIST_LENGTH).optional(),
}) satisfies z.ZodType<CreateRoomRequest>;

export const joinRoomSchema = z.object({
  roomId: z.string().min(1).max(64),
}) satisfies z.ZodType<JoinRoomRequest>;

export const claimNicknameSchema = z.object({
  nickname: nicknameSchema,
}) satisfies z.ZodType<ClaimNicknameRequest>;

export function parseNickname(raw: unknown): string | null {
  return parseWith(nicknameSchema, raw);
}

/** No guest or account may take it: built-in levels show it as their author. */
export const RESERVED_NICKNAME = 'BulletsNdGuns';

/**
 * Two nicknames with the same key are the same name: case, width, invisible characters and outer
 * spaces don't count. Idempotent (better-auth applies it twice): NFKC first, since it can produce
 * spaces (`´` becomes a space and a combining accent) that trimming must then see.
 */
export function nicknameKey(nickname: string): string {
  return nickname.normalize('NFKC').replace(INVISIBLE, '').trim().toLowerCase().normalize('NFKC');
}

export function isReservedNickname(nickname: string): boolean {
  return nicknameKey(nickname) === nicknameKey(RESERVED_NICKNAME);
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

/** Validates an untrusted `claimNickname` payload. Returns a fresh request, or null. Never throws. */
export function parseClaimNickname(raw: unknown): ClaimNicknameRequest | null {
  return parseWith(claimNicknameSchema, raw);
}
