import type { Room } from './room.ts';

export const DEFAULT_ROOM_ID = 'default';

export class RoomManager {
  private readonly createRoom: (id: string) => Room;
  private readonly rooms = new Map<string, Room>();

  constructor(createRoom: (id: string) => Room) {
    this.createRoom = createRoom;
  }

  /** Single room for now; more can be added later by id. */
  defaultRoom(): Room {
    let room = this.rooms.get(DEFAULT_ROOM_ID);
    if (!room) {
      room = this.createRoom(DEFAULT_ROOM_ID);
      this.rooms.set(DEFAULT_ROOM_ID, room);
    }
    return room;
  }
}
