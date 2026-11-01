import type { BulletState, PlayerId, PlayerState } from '../simulation/player.ts';
import type { WorldState } from '../simulation/world.ts';
import type { InputFrame } from './input.ts';
import type { RoomAck, RoomLobby } from './rooms.ts';

export interface Snapshot {
  tick: number;
  levelIndex: number;
  /** Last input seq the server applied for the recipient (0 if none). */
  ackSeq: number;
  players: PlayerState[];
  bullets: BulletState[];
  /**
   * Bullets fired since the previous snapshot sent to this room, so a shot is heard even if its
   * bullet is gone before any snapshot shows it.
   */
  shots: BulletState[];
  ammoPickupIds: number[];
  coinIds: number[];
}

export interface MatchScores {
  scores: { id: PlayerId; score: number }[];
}

/** `completed`: the last level was finished. `rivalsLeft`: everyone else left mid-match. */
export type MatchEndReason = 'completed' | 'rivalsLeft';

export interface MatchEnded extends MatchScores {
  reason: MatchEndReason;
}

export interface LevelStarted {
  levelIndex: number;
  snapshot: Snapshot;
  /** Nickname of every player in the match. Nobody joins mid-match, so it never grows. */
  nicknames: Record<PlayerId, string>;
}

export interface ServerToClientEvents {
  lobbyUpdated: (lobby: RoomLobby) => void;
  levelStarted: (payload: LevelStarted) => void;
  snapshot: (snapshot: Snapshot) => void;
  matchEnded: (payload: MatchEnded) => void;
}

/** Payloads are `unknown`: the server validates them with the parse functions. */
export interface ClientToServerEvents {
  createRoom: (request: unknown, ack: (result: RoomAck) => void) => void;
  joinRoom: (request: unknown, ack: (result: RoomAck) => void) => void;
  leaveRoom: () => void;
  ready: () => void;
  input: (frame: InputFrame) => void;
}

/** Validates untrusted client input. Returns a fresh InputFrame, or null if malformed. Never throws. */
export function parseInput(raw: unknown): InputFrame | null {
  try {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
    const r = raw as Record<string, unknown>;
    const { seq, level, left, right, jump, shoot } = r;
    if (typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq < 1) return null;
    if (typeof level !== 'number' || !Number.isSafeInteger(level) || level < 0) return null;
    if (
      typeof left !== 'boolean' ||
      typeof right !== 'boolean' ||
      typeof jump !== 'boolean' ||
      typeof shoot !== 'boolean'
    ) {
      return null;
    }
    return { seq, level, left, right, jump, shoot };
  } catch {
    return null;
  }
}

export function toSnapshot(
  world: WorldState,
  ackSeq: number,
  shots: readonly BulletState[] = [],
): Snapshot {
  return {
    tick: world.tick,
    levelIndex: world.levelIndex,
    ackSeq,
    players: [...world.players],
    bullets: [...world.bullets],
    shots: [...shots],
    ammoPickupIds: world.ammoPickups.map((p) => p.id),
    coinIds: world.coins.map((p) => p.id),
  };
}
