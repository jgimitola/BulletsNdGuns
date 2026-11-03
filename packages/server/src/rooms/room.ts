import {
  INPUT_QUEUE_LIMIT,
  INPUT_STARVATION_TICKS,
  MIN_PLAYERS_TO_START,
  NEUTRAL_INPUT,
  SNAPSHOT_EVERY_TICKS,
  createWorld,
  removePlayer,
  startLevel,
  stepWorld,
  toSnapshot,
  type BulletState,
  type InputFrame,
  type InputKeys,
  type Level,
  type MatchEndReason,
  type PlayerId,
  type RoomLobby,
  type RoomSummary,
  type ServerToClientEvents,
  type Side,
  type WorldState,
} from '@bng/shared';

/** Implemented by the socket gateway. */
export interface RoomTransport {
  send<E extends keyof ServerToClientEvents>(
    playerId: PlayerId,
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ): void;
}

export interface TickScheduler {
  start(onTick: () => void): void;
  stop(): void;
}

/** A closed room is finished for good: its manager forgets it and it ignores every call. */
export type RoomPhase =
  | { kind: 'lobby'; ready: Set<PlayerId> }
  | { kind: 'playing'; world: WorldState }
  | { kind: 'closed' };

interface Participant {
  nickname: string;
  side: Side;
  queue: InputFrame[];
  /** Highest seq ever queued; anything at or below is stale. */
  lastQueuedSeq: number;
  /** Keys of the last frame taken from the queue, reused while the queue starves. */
  lastKeys: InputKeys;
  emptyTicks: number;
  /** Seq of the last frame actually taken from the queue. */
  ackSeq: number;
}

export interface RoomOptions {
  id: string;
  name: string;
  /** The levels a match plays, in order. The room keeps them for its whole life. Never empty. */
  playlist: readonly Level[];
  transport: RoomTransport;
  scheduler: TickScheduler;
  /** Called once, when the room closes. */
  onClosed?: (room: Room) => void;
}

export class Room {
  readonly id: string;
  readonly name: string;
  private readonly playlist: readonly Level[];
  private readonly transport: RoomTransport;
  private readonly scheduler: TickScheduler;
  private readonly onClosed: (room: Room) => void;
  private phase: RoomPhase = { kind: 'lobby', ready: new Set() };
  private readonly participants = new Map<PlayerId, Participant>();
  /** Bullets fired since the last snapshot, sent with the next one so every shot is heard. */
  private pendingShots: BulletState[] = [];

  constructor({ id, name, playlist, transport, scheduler, onClosed = () => {} }: RoomOptions) {
    if (playlist.length === 0) throw new Error('A room needs at least one level');
    this.id = id;
    this.name = name;
    this.playlist = playlist;
    this.transport = transport;
    this.scheduler = scheduler;
    this.onClosed = onClosed;
  }

  get phaseKind(): RoomPhase['kind'] {
    return this.phase.kind;
  }

  get playerIds(): readonly PlayerId[] {
    return [...this.participants.keys()];
  }

  /** The room table row. */
  summary(): RoomSummary {
    return {
      id: this.id,
      name: this.name,
      players: this.participants.size,
      status: this.phase.kind === 'lobby' ? 'lobby' : 'playing',
    };
  }

  lobby(): RoomLobby {
    const ready = this.phase.kind === 'lobby' ? this.phase.ready : new Set<PlayerId>();
    return {
      id: this.id,
      name: this.name,
      players: [...this.participants].map(([id, p]) => ({
        id,
        nickname: p.nickname,
        ready: ready.has(id),
      })),
    };
  }

  join(playerId: PlayerId, nickname: string): 'joined' | 'refused' {
    if (this.phase.kind !== 'lobby' || this.participants.has(playerId)) return 'refused';
    let left = 0;
    for (const p of this.participants.values()) if (p.side === 'left') left++;
    const right = this.participants.size - left;
    this.participants.set(playerId, {
      nickname,
      side: left <= right ? 'left' : 'right',
      queue: [],
      lastQueuedSeq: 0,
      lastKeys: NEUTRAL_INPUT,
      emptyTicks: 0,
      ackSeq: 0,
    });
    this.sendLobby();
    return 'joined';
  }

  /** An empty room closes; a match left with one player ends and that player wins. */
  leave(playerId: PlayerId): void {
    if (this.phase.kind === 'closed' || !this.participants.delete(playerId)) return;
    if (this.participants.size === 0) {
      this.close();
      return;
    }
    if (this.phase.kind === 'playing') {
      const world = removePlayer(this.phase.world, playerId);
      this.phase = { kind: 'playing', world };
      if (this.participants.size === 1) this.endMatch(world, 'rivalsLeft');
      return;
    }
    this.phase.ready.delete(playerId);
    this.sendLobby();
    this.maybeStart();
  }

  markReady(playerId: PlayerId): void {
    if (this.phase.kind !== 'lobby' || !this.participants.has(playerId)) return;
    if (this.phase.ready.has(playerId)) return;
    this.phase.ready.add(playerId);
    this.sendLobby();
    this.maybeStart();
  }

  queueInput(playerId: PlayerId, frame: InputFrame): void {
    const p = this.participants.get(playerId);
    if (!p || frame.seq <= p.lastQueuedSeq) return;
    p.lastQueuedSeq = frame.seq;
    // Frames sampled in another level (in flight across a level change) or in the lobby are dropped.
    if (this.phase.kind !== 'playing' || frame.level !== this.phase.world.levelIndex) return;
    p.queue.push(frame);
    if (p.queue.length > INPUT_QUEUE_LIMIT) {
      // A press is a one-tick event the client already predicted (and drew its bullet for), so
      // losing it would desync; held keys are redundant across frames and safe to drop.
      const droppable = p.queue.findIndex((f) => !this.hasPress(f));
      p.queue.splice(droppable === -1 ? 0 : droppable, 1);
    }
  }

  private hasPress(frame: InputFrame): boolean {
    return frame.jumpPressed || frame.shootPressed;
  }

  /** One simulation tick; the scheduler calls it at 60 Hz. */
  tick(): void {
    if (this.phase.kind !== 'playing') return;
    const { levelIndex } = this.phase.world;
    const stepped = stepWorld(
      this.phase.world,
      this.takeInputs(levelIndex),
      this.levelAt(levelIndex),
    );
    let world = stepped.world;
    for (const e of stepped.events) if (e.type === 'shot') this.pendingShots.push(e.bullet);
    const completed = stepped.events.find((e) => e.type === 'levelCompleted');
    if (completed) {
      if (levelIndex === this.playlist.length - 1) {
        this.endMatch(world, 'completed');
        return;
      }
      world = startLevel(world, levelIndex + 1, this.levelAt(levelIndex + 1));
      this.phase = { kind: 'playing', world };
      this.resetInputs();
      this.sendLevelStarted(world);
      return;
    }
    this.phase = { kind: 'playing', world };
    if (world.tick % SNAPSHOT_EVERY_TICKS === 0) {
      const shots = this.pendingShots;
      this.pendingShots = [];
      this.broadcast((id) =>
        this.transport.send(id, 'snapshot', toSnapshot(world, this.ackOf(id), shots)),
      );
    }
  }

  /** @internal Test seam: replaces the world while playing. */
  __setWorldForTest(world: WorldState): void {
    if (this.phase.kind === 'playing') this.phase = { kind: 'playing', world };
  }

  /** @internal Test seam. */
  worldForTest(): WorldState | undefined {
    return this.phase.kind === 'playing' ? this.phase.world : undefined;
  }

  /** @internal Test seam. */
  ackSeqForTest(playerId: PlayerId): number {
    return this.ackOf(playerId);
  }

  private endMatch(world: WorldState, reason: MatchEndReason): void {
    const scores = world.players.map((p) => ({ id: p.id, score: p.score }));
    this.broadcast((id) => this.transport.send(id, 'matchEnded', { scores, reason }));
    this.close();
  }

  private close(): void {
    this.phase = { kind: 'closed' };
    this.scheduler.stop();
    this.participants.clear();
    this.pendingShots = [];
    this.onClosed(this);
  }

  private maybeStart(): void {
    if (this.phase.kind !== 'lobby') return;
    const { ready } = this.phase;
    if (this.participants.size < MIN_PLAYERS_TO_START) return;
    for (const id of this.participants.keys()) if (!ready.has(id)) return;
    const world = createWorld(
      [...this.participants].map(([id, p]) => ({ id, side: p.side })),
      this.levelAt(0),
    );
    this.phase = { kind: 'playing', world };
    this.resetInputs();
    this.sendLevelStarted(world);
    this.scheduler.start(() => this.tick());
  }

  /** At every level start: nothing queued or held before it may apply in it. lastQueuedSeq stays. */
  private resetInputs(): void {
    this.pendingShots = [];
    for (const p of this.participants.values()) {
      p.lastKeys = NEUTRAL_INPUT;
      p.emptyTicks = 0;
      p.queue.length = 0;
    }
  }

  private takeInputs(level: number): Map<PlayerId, InputFrame> {
    const inputs = new Map<PlayerId, InputFrame>();
    for (const [id, p] of this.participants) {
      const next = p.queue.shift();
      if (next) {
        p.lastKeys = next;
        p.emptyTicks = 0;
        p.ackSeq = next.seq;
        inputs.set(id, next);
      } else {
        p.emptyTicks++;
        // Reuse is movement-only: the client never predicted server-synthesised jumps/shots.
        const reuse = p.emptyTicks <= INPUT_STARVATION_TICKS;
        inputs.set(id, {
          ...NEUTRAL_INPUT,
          left: reuse && p.lastKeys.left,
          right: reuse && p.lastKeys.right,
          seq: p.ackSeq,
          level,
        });
      }
    }
    return inputs;
  }

  private sendLobby(): void {
    const lobby = this.lobby();
    this.broadcast((id) => this.transport.send(id, 'lobbyUpdated', lobby));
  }

  private sendLevelStarted(world: WorldState): void {
    const nicknames: Record<PlayerId, string> = {};
    for (const [id, p] of this.participants) nicknames[id] = p.nickname;
    this.broadcast((id) =>
      this.transport.send(id, 'levelStarted', {
        levelIndex: world.levelIndex,
        level: this.levelAt(world.levelIndex).data,
        snapshot: toSnapshot(world, this.ackOf(id)),
        nicknames,
      }),
    );
  }

  private levelAt(index: number): Level {
    const level = this.playlist[index];
    if (!level) throw new RangeError(`Playlist has no level ${index}`);
    return level;
  }

  private ackOf(id: PlayerId): number {
    return this.participants.get(id)?.ackSeq ?? 0;
  }

  private broadcast(send: (id: PlayerId) => void): void {
    for (const id of this.participants.keys()) send(id);
  }
}
