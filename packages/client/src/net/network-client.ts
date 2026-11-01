import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, InputFrame, ServerToClientEvents } from '@bng/shared';

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

  sendReady(): void {
    this.socket.emit('ready');
  }

  sendInput(frame: InputFrame): void {
    this.lastSeq = Math.max(this.lastSeq, frame.seq);
    this.socket.emit('input', frame);
  }
}
