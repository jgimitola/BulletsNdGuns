import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, InputFrame, ServerToClientEvents } from '@bng/shared';

export class NetworkClient {
  private readonly socket: Socket<ServerToClientEvents, ClientToServerEvents> = io();

  get playerId(): string | undefined {
    return this.socket.id;
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
    this.socket.emit('input', frame);
  }
}
