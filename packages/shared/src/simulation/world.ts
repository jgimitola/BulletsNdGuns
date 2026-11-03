import { overlaps, type Rect } from '../geometry.ts';
import type { Side } from '../levels/level-data.ts';
import { ammoPickupRect, coinRect, portalRect, type Level, type Pickup } from '../levels/level.ts';
import { NEUTRAL_INPUT, type InputFrame } from '../protocol/input.ts';
import { bulletBox, stepBullet } from './bullet.ts';
import { bodyBox } from './player-body.ts';
import {
  createPlayer,
  respawn,
  stepPlayer,
  type BulletState,
  type PlayerId,
  type PlayerState,
} from './player.ts';

export interface WorldState {
  tick: number;
  /** Index of the level in the room's playlist. */
  levelIndex: number;
  players: PlayerState[];
  bullets: BulletState[];
  ammoPickups: Pickup[];
  coins: Pickup[];
}

export type WorldEvent =
  | { type: 'shot'; bullet: BulletState }
  | { type: 'jumped'; playerId: PlayerId }
  | { type: 'hit'; shooterId: PlayerId; victimId: PlayerId }
  | { type: 'pickup'; kind: 'ammo' | 'coin'; pickupId: number; playerId: PlayerId }
  | { type: 'levelCompleted'; levelIndex: number; byPlayerId: PlayerId };

export function createWorld(
  players: readonly { id: PlayerId; side: Side }[],
  level: Level,
): WorldState {
  return {
    tick: 0,
    levelIndex: 0,
    players: players.map((p) => createPlayer(p.id, p.side, level)),
    bullets: [],
    ammoPickups: [...level.ammoPickups],
    coins: [...level.coins],
  };
}

/** Recreates players at the new level's spawns (keeping score), clears bullets, resets pickups. */
export function startLevel(world: WorldState, levelIndex: number, level: Level): WorldState {
  return {
    tick: world.tick,
    levelIndex,
    players: world.players.map((p) => createPlayer(p.id, p.side, level, p.score)),
    bullets: [],
    ammoPickups: [...level.ammoPickups],
    coins: [...level.coins],
  };
}

/** Bullets already in flight keep flying. */
export function removePlayer(world: WorldState, id: PlayerId): WorldState {
  return { ...world, players: world.players.filter((p) => p.id !== id) };
}

/** Index of the first box (join order) overlapping `rect`, or -1. */
function firstOverlap(boxes: readonly Rect[], rect: Rect): number {
  return boxes.findIndex((box) => overlaps(box, rect));
}

export function stepWorld(
  world: WorldState,
  inputs: ReadonlyMap<PlayerId, InputFrame>,
  level: Level,
): { world: WorldState; events: WorldEvent[] } {
  const events: WorldEvent[] = [];

  // 1. Players, in join order.
  const stepped: PlayerState[] = [];
  const spawned: BulletState[] = [];
  for (const p of world.players) {
    const input = inputs.get(p.id) ?? { seq: 0, level: world.levelIndex, ...NEUTRAL_INPUT };
    const r = stepPlayer(p, input, level);
    stepped.push(r.player);
    if (r.jumped) events.push({ type: 'jumped', playerId: p.id });
    if (r.bullet) {
      spawned.push(r.bullet);
      events.push({ type: 'shot', bullet: r.bullet });
    }
  }
  // Boxes come from the post-step-1 states; a player respawned by a hit gets a fresh box in step 3.
  const boxes = stepped.map((p) => bodyBox(p));
  const players = [...stepped];

  // 2. Bullets, new ones included.
  const flying: BulletState[] = [];
  for (const b of [...world.bullets, ...spawned]) {
    const n = stepBullet(b, level);
    if (n) flying.push(n);
  }

  // 3. Hits: first non-owner player in join order; the bullet is consumed, the victim respawns.
  const bullets: BulletState[] = [];
  for (const b of flying) {
    const box = bulletBox(b);
    const i = stepped.findIndex((p, k) => p.id !== b.ownerId && overlaps(boxes[k]!, box));
    const victim = players[i];
    if (!victim) {
      bullets.push(b);
      continue;
    }
    const respawned = respawn(victim, level);
    players[i] = respawned;
    // A player shot this tick is already at the spawn: no pickups or portal from where it was hit.
    boxes[i] = bodyBox(respawned);
    events.push({ type: 'hit', shooterId: b.ownerId, victimId: victim.id });
  }

  // 4. Pickups: coins, then ammo. Each goes to the first player in join order overlapping it.
  const coins: Pickup[] = [];
  for (const c of world.coins) {
    const i = firstOverlap(boxes, coinRect(c));
    const taker = players[i];
    if (!taker) {
      coins.push(c);
      continue;
    }
    players[i] = { ...taker, score: taker.score + 1 };
    events.push({ type: 'pickup', kind: 'coin', pickupId: c.id, playerId: taker.id });
  }
  const ammoPickups: Pickup[] = [];
  for (const a of world.ammoPickups) {
    const i = firstOverlap(boxes, ammoPickupRect(a));
    const taker = players[i];
    if (!taker) {
      ammoPickups.push(a);
      continue;
    }
    players[i] = { ...taker, ammo: taker.ammo + 1 };
    events.push({ type: 'pickup', kind: 'ammo', pickupId: a.id, playerId: taker.id });
  }

  // 5. Portal: the first player in join order only. The Room advances the level.
  const winner = players[firstOverlap(boxes, portalRect(level))];
  if (winner) {
    events.push({ type: 'levelCompleted', levelIndex: world.levelIndex, byPlayerId: winner.id });
  }

  // 6. Tick.
  return {
    world: {
      tick: world.tick + 1,
      levelIndex: world.levelIndex,
      players,
      bullets,
      ammoPickups,
      coins,
    },
    events,
  };
}
