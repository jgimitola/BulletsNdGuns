import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  InputFrame,
  RoomAck,
  RoomError,
  RoomId,
  ServerToClientEvents,
} from '@bng/shared';

/** How long a create/join may wait for the server before the UI gives up on it. */
const ROOM_ACK_TIMEOUT_MS = 5000;

/** A room ack, or `noResponse` when the server did not answer in time. */
export type RoomResponse = RoomAck | { ok: false; error: RoomError | 'noResponse' };

export class NetworkClient {
  private readonly socket: Socket<ServerToClientEvents, ClientToServerEvents> = io();
  private lastSeq = 0;

  get playerId(): string | undefined {
    return this.socket.id;
  }

  /** Seq of the last input frame sent on this connection (0 before the first). */
  get lastInputSeq(): number {
    return this.lastSeq;
  }

  on<E extends keyof ServerToClientEvents>(event: E, handler: ServerToClientEvents[E]): () => void {
    // The listener typings cannot correlate a generic event name with its handler type.
    const listener = handler as never;
    this.socket.on(event, listener);
    return () => {
      this.socket.off(event, listener);
    };
  }

  /** Runs on every (re)connection. */
  onConnect(handler: () => void): void {
    this.socket.on('connect', handler);
  }

  createRoom(name: string, nickname: string): Promise<RoomResponse> {
    return this.withTimeout('createRoom', { name, nickname });
  }

  joinRoom(roomId: RoomId, nickname: string): Promise<RoomResponse> {
    return this.withTimeout('joinRoom', { roomId, nickname });
  }

  leaveRoom(): void {
    this.socket.emit('leaveRoom');
  }

  /** Round trip to the server in milliseconds, or null if it did not answer within `timeoutMs`. */
  async measureLatency(timeoutMs: number): Promise<number | null> {
    const start = performance.now();
    try {
      await this.socket.timeout(timeoutMs).emitWithAck('latency');
      return performance.now() - start;
    } catch {
      return null;
    }
  }

  sendReady(): void {
    this.socket.emit('ready');
  }

  sendInput(frame: InputFrame): void {
    this.lastSeq = Math.max(this.lastSeq, frame.seq);
    this.socket.emit('input', frame);
  }

  private async withTimeout(
    event: 'createRoom' | 'joinRoom',
    request: unknown,
  ): Promise<RoomResponse> {
    try {
      return await this.socket.timeout(ROOM_ACK_TIMEOUT_MS).emitWithAck(event, request);
    } catch {
      return { ok: false, error: 'noResponse' };
    }
  }
}
