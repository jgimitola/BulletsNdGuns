import {
  getLevel,
  stepPlayer,
  type BulletState,
  type InputFrame,
  type InputKeys,
  type Level,
  type PlayerId,
  type PlayerState,
  type Snapshot,
} from '@bng/shared';

/**
 * Predicts the local player with the same stepPlayer the server runs, and reconciles against
 * snapshots by rewinding to the server's copy and replaying the inputs it has not yet applied.
 */
export class LocalPlayerPredictor {
  private readonly playerId: PlayerId;
  private readonly levelIndex: number;
  private readonly level: Level;
  private current: PlayerState;
  private nextSeq: number;
  private unacked: InputFrame[] = [];

  /**
   * `firstSeq` must continue the connection's numbering: the server drops any frame whose seq is
   * not above the last one it queued, and that count is not reset between levels.
   */
  constructor(playerId: PlayerId, levelIndex: number, initial: PlayerState, firstSeq = 1) {
    this.playerId = playerId;
    this.levelIndex = levelIndex;
    this.level = getLevel(levelIndex);
    this.current = initial;
    this.nextSeq = firstSeq;
  }

  get state(): PlayerState {
    return this.current;
  }

  /** Inputs sent but not yet acknowledged by the server. */
  get pending(): readonly InputFrame[] {
    return this.unacked;
  }

  applyInput(keys: InputKeys): {
    frame: InputFrame;
    jumped: boolean;
    bullet: BulletState | null;
  } {
    // Tagged with the level so the server can drop it if it arrives after a level change.
    const frame: InputFrame = { ...keys, seq: this.nextSeq++, level: this.levelIndex };
    const result = stepPlayer(this.current, frame, this.level);
    this.current = result.player;
    this.unacked.push(frame);
    return { frame, jumped: result.jumped, bullet: result.bullet };
  }

  /** Replay is silent: jump and shot events only ever come from applyInput. */
  reconcile(snapshot: Snapshot): void {
    if (snapshot.levelIndex !== this.levelIndex) return;
    const server = snapshot.players.find((p) => p.id === this.playerId);
    if (!server) return;
    this.unacked = this.unacked.filter((f) => f.seq > snapshot.ackSeq);
    let state = server;
    for (const frame of this.unacked) state = stepPlayer(state, frame, this.level).player;
    this.current = state;
  }
}
