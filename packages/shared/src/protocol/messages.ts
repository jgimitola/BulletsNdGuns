import type { BulletState, PlayerId, PlayerState } from '../simulation/player.ts';
import type { WorldState } from '../simulation/world.ts';
import type { InputFrame } from './input.ts';

export interface Snapshot {
  tick: number;
  levelIndex: number;
  /** Last input seq the server applied for the recipient (0 if none). */
  ackSeq: number;
  players: PlayerState[];
  bullets: BulletState[];
  ammoPickupIds: number[];
  coinIds: number[];
}

export interface MatchScores {
  scores: { id: PlayerId; score: number }[];
}

export interface ServerToClientEvents {
  joined: () => void;
  matchInProgress: () => void;
  levelStarted: (payload: { levelIndex: number; snapshot: Snapshot }) => void;
  snapshot: (snapshot: Snapshot) => void;
  matchEnded: (payload: MatchScores) => void;
}

export interface ClientToServerEvents {
  ready: () => void;
  input: (frame: InputFrame) => void;
}

/** Validates untrusted client input. Returns a fresh InputFrame, or null if malformed. Never throws. */
export function parseInput(raw: unknown): InputFrame | null {
  try {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
    const r = raw as Record<string, unknown>;
    const { seq, left, right, jump, shoot } = r;
    if (typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq < 1) return null;
    if (
      typeof left !== 'boolean' ||
      typeof right !== 'boolean' ||
      typeof jump !== 'boolean' ||
      typeof shoot !== 'boolean'
    ) {
      return null;
    }
    return { seq, left, right, jump, shoot };
  } catch {
    return null;
  }
}

export function toSnapshot(world: WorldState, ackSeq: number): Snapshot {
  return {
    tick: world.tick,
    levelIndex: world.levelIndex,
    ackSeq,
    players: [...world.players],
    bullets: [...world.bullets],
    ammoPickupIds: world.ammoPickups.map((p) => p.id),
    coinIds: world.coins.map((p) => p.id),
  };
}
