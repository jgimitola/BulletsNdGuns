import {
  INPUT_QUEUE_LIMIT,
  INPUT_STARVATION_TICKS,
  MIN_PLAYERS_TO_START,
  NEUTRAL_INPUT,
  SNAPSHOT_EVERY_TICKS,
  createWorld,
  isLastLevel,
  removePlayer,
  startLevel,
  stepWorld,
  toSnapshot,
  type BulletState,
  type InputFrame,
  type InputKeys,
  type MatchScores,
  type PlayerId,
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

export type RoomPhase =
  | { kind: 'lobby'; ready: Set<PlayerId> }
  | { kind: 'playing'; world: WorldState }
  | { kind: 'gameOver'; scores: MatchScores['scores'] };

interface Participant {
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

export class Room {
  readonly id: string;
  private readonly transport: RoomTransport;
  private readonly scheduler: TickScheduler;
  private phase: RoomPhase = { kind: 'lobby', ready: new Set() };
  private readonly participants = new Map<PlayerId, Participant>();
  /** Bullets fired since the last snapshot, sent with the next one so every shot is heard. */
  private pendingShots: BulletState[] = [];

  constructor(id: string, transport: RoomTransport, scheduler: TickScheduler) {
    this.id = id;
    this.transport = transport;
    this.scheduler = scheduler;
  }

  get phaseKind(): RoomPhase['kind'] {
    return this.phase.kind;
  }

  get playerIds(): readonly PlayerId[] {
    return [...this.participants.keys()];
  }

  join(playerId: PlayerId): 'joined' | 'refused' {
    if (this.phase.kind !== 'lobby' || this.participants.has(playerId)) return 'refused';
    let left = 0;
    for (const p of this.participants.values()) if (p.side === 'left') left++;
    const right = this.participants.size - left;
    this.participants.set(playerId, {
      side: left <= right ? 'left' : 'right',
      queue: [],
      lastQueuedSeq: 0,
      lastKeys: NEUTRAL_INPUT,
      emptyTicks: 0,
      ackSeq: 0,
    });
    return 'joined';
  }

  leave(playerId: PlayerId): void {
    if (!this.participants.delete(playerId)) return;
    switch (this.phase.kind) {
      case 'lobby':
        this.phase.ready.delete(playerId);
        break;
      case 'playing':
        this.phase = { kind: 'playing', world: removePlayer(this.phase.world, playerId) };
        break;
      case 'gameOver':
        break;
    }
    if (this.participants.size === 0) {
      this.scheduler.stop();
      this.phase = { kind: 'lobby', ready: new Set() };
      return;
    }
    this.maybeStart();
  }

  markReady(playerId: PlayerId): void {
    if (this.phase.kind !== 'lobby' || !this.participants.has(playerId)) return;
    this.phase.ready.add(playerId);
    this.maybeStart();
  }

  queueInput(playerId: PlayerId, frame: InputFrame): void {
    const p = this.participants.get(playerId);
    if (!p || frame.seq <= p.lastQueuedSeq) return;
    p.lastQueuedSeq = frame.seq;
    // Frames sampled in another level (in flight across a level change) or in the lobby are dropped.
    if (this.phase.kind !== 'playing' || frame.level !== this.phase.world.levelIndex) return;
    p.queue.push(frame);
    if (p.queue.length > INPUT_QUEUE_LIMIT) p.queue.shift();
  }

  /** One simulation tick; the scheduler calls it at 60 Hz. */
  tick(): void {
    if (this.phase.kind !== 'playing') return;
    const stepped = stepWorld(this.phase.world, this.takeInputs(this.phase.world.levelIndex));
    let world = stepped.world;
    for (const e of stepped.events) if (e.type === 'shot') this.pendingShots.push(e.bullet);
    const completed = stepped.events.find((e) => e.type === 'levelCompleted');
    if (completed) {
      if (isLastLevel(world.levelIndex)) {
        const scores = world.players.map((p) => ({ id: p.id, score: p.score }));
        this.phase = { kind: 'gameOver', scores };
        this.scheduler.stop();
        this.broadcast((id) => this.transport.send(id, 'matchEnded', { scores }));
        return;
      }
      world = startLevel(world, world.levelIndex + 1);
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

  private maybeStart(): void {
    if (this.phase.kind !== 'lobby') return;
    const { ready } = this.phase;
    if (this.participants.size < MIN_PLAYERS_TO_START) return;
    for (const id of this.participants.keys()) if (!ready.has(id)) return;
    const world = createWorld([...this.participants].map(([id, p]) => ({ id, side: p.side })));
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

  private sendLevelStarted(world: WorldState): void {
    this.broadcast((id) =>
      this.transport.send(id, 'levelStarted', {
        levelIndex: world.levelIndex,
        snapshot: toSnapshot(world, this.ackOf(id)),
      }),
    );
  }

  private ackOf(id: PlayerId): number {
    return this.participants.get(id)?.ackSeq ?? 0;
  }

  private broadcast(send: (id: PlayerId) => void): void {
    for (const id of this.participants.keys()) send(id);
  }
}
