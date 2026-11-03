import { z } from 'zod';
import type { PlayableLevelData } from '../levels/level-data.ts';
import type { BulletState, PlayerId, PlayerState } from '../simulation/player.ts';
import type { WorldState } from '../simulation/world.ts';
import { parseWith } from '../validation.ts';
import type { InputFrame } from './input.ts';
import type { NicknameAck, RoomAck, RoomLobby } from './rooms.ts';

/** `z.int()` only takes safe integers. */
export const inputFrameSchema = z.object({
  seq: z.int().min(1),
  level: z.int().min(0),
  left: z.boolean(),
  right: z.boolean(),
  jumpPressed: z.boolean(),
  shootPressed: z.boolean(),
}) satisfies z.ZodType<InputFrame>;

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
  /** Index in the room's playlist. */
  levelIndex: number;
  /** The level to draw and predict with; clients don't bundle levels. */
  level: PlayableLevelData;
  snapshot: Snapshot;
  /** Nickname of every player in the match. Nobody joins mid-match, so it never grows. */
  nicknames: Record<PlayerId, string>;
}

export interface ServerToClientEvents {
  lobbyUpdated: (lobby: RoomLobby) => void;
  levelStarted: (payload: LevelStarted) => void;
  snapshot: (snapshot: Snapshot) => void;
  matchEnded: (payload: MatchEnded) => void;
  /** A registered player took this guest's nickname; they must claim another before joining a room. */
  nicknameRevoked: (nickname: string) => void;
}

/** Payloads are `unknown`: the server validates them with the parse functions. */
export interface ClientToServerEvents {
  /** Guests only: account sockets use their account's nickname. */
  claimNickname: (request: unknown, ack: (result: NicknameAck) => void) => void;
  createRoom: (request: unknown, ack: (result: RoomAck) => void) => void;
  joinRoom: (request: unknown, ack: (result: RoomAck) => void) => void;
  leaveRoom: () => void;
  ready: () => void;
  /** Answered at once with an empty ack; the client times the round trip. */
  latency: (ack: () => void) => void;
  input: (frame: InputFrame) => void;
}

/** Validates untrusted client input. Returns a fresh InputFrame, or null if malformed. Never throws. */
export function parseInput(raw: unknown): InputFrame | null {
  return parseWith(inputFrameSchema, raw);
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
