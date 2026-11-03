import { randomUUID } from 'node:crypto';
import type { PlayerId, RoomError, RoomId, RoomLobby, RoomSummary } from '@bng/shared';
import type { PlaylistLevel, Room, RoomOptions } from './room.ts';

/** Upper bound on open rooms, so a client cannot exhaust the server by creating them. */
export const MAX_ROOMS = 50;

export type RoomFactory = (
  options: Pick<RoomOptions, 'id' | 'name' | 'playlist' | 'onClosed'>,
) => Room;

export type RoomResult = { ok: true; lobby: RoomLobby } | { ok: false; error: RoomError };

/** Owns every open room and which room each player is in. A player is in at most one room. */
export class RoomManager {
  private readonly createRoom: RoomFactory;
  private readonly newId: () => RoomId;
  private readonly rooms = new Map<RoomId, Room>();
  private readonly roomOfPlayer = new Map<PlayerId, Room>();

  constructor(createRoom: RoomFactory, newId: () => RoomId = randomUUID) {
    this.createRoom = createRoom;
    this.newId = newId;
  }

  /** Open rooms in creation order. */
  list(): RoomSummary[] {
    return [...this.rooms.values()].map((room) => room.summary());
  }

  roomOf(playerId: PlayerId): Room | undefined {
    return this.roomOfPlayer.get(playerId);
  }

  create(
    playerId: PlayerId,
    name: string,
    nickname: string,
    playlist: readonly PlaylistLevel[],
  ): RoomResult {
    if (this.roomOfPlayer.has(playerId)) return { ok: false, error: 'alreadyInRoom' };
    if (this.rooms.size >= MAX_ROOMS) return { ok: false, error: 'tooManyRooms' };
    const room = this.createRoom({
      id: this.newId(),
      name,
      playlist,
      onClosed: (closed) => this.forget(closed),
    });
    this.rooms.set(room.id, room);
    return this.join(playerId, room.id, nickname);
  }

  join(playerId: PlayerId, roomId: RoomId, nickname: string): RoomResult {
    if (this.roomOfPlayer.has(playerId)) return { ok: false, error: 'alreadyInRoom' };
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, error: 'notFound' };
    if (room.join(playerId, nickname) === 'refused') return { ok: false, error: 'inProgress' };
    this.roomOfPlayer.set(playerId, room);
    return { ok: true, lobby: room.lobby() };
  }

  /** Leaving may close the room, which forgets it and every player still in it. */
  leave(playerId: PlayerId): void {
    const room = this.roomOfPlayer.get(playerId);
    if (!room) return;
    this.roomOfPlayer.delete(playerId);
    room.leave(playerId);
  }

  private forget(room: Room): void {
    this.rooms.delete(room.id);
    for (const [playerId, r] of this.roomOfPlayer) {
      if (r === room) this.roomOfPlayer.delete(playerId);
    }
  }
}
