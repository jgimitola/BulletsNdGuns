import type { PlayerId } from '../simulation/player.ts';

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

/** Trimmed text of 1..maxLength characters without control characters, or null. Never throws. */
function parseLabel(raw: unknown, maxLength: number): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  // Count code points so an emoji is one character, as the player sees it.
  const length = [...text].length;
  if (length < 1 || length > maxLength || CONTROL_CHARS.test(text)) return null;
  return text;
}

export function parseNickname(raw: unknown): string | null {
  return parseLabel(raw, NICKNAME_MAX_LENGTH);
}

export function parseRoomName(raw: unknown): string | null {
  return parseLabel(raw, ROOM_NAME_MAX_LENGTH);
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

/** Validates an untrusted `createRoom` payload. Returns a fresh request, or null. Never throws. */
export function parseCreateRoom(raw: unknown): CreateRoomRequest | null {
  try {
    const r = asRecord(raw);
    if (!r) return null;
    const name = parseRoomName(r['name']);
    const nickname = parseNickname(r['nickname']);
    return name !== null && nickname !== null ? { name, nickname } : null;
  } catch {
    return null;
  }
}

/** Validates an untrusted `joinRoom` payload. Returns a fresh request, or null. Never throws. */
export function parseJoinRoom(raw: unknown): JoinRoomRequest | null {
  try {
    const r = asRecord(raw);
    if (!r) return null;
    const roomId = r['roomId'];
    const nickname = parseNickname(r['nickname']);
    if (typeof roomId !== 'string' || roomId.length === 0 || roomId.length > 64) return null;
    return nickname !== null ? { roomId, nickname } : null;
  } catch {
    return null;
  }
}
