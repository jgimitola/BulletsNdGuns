import {
  BULLET_SPAWN_OFFSET_Y,
  BULLET_SPEED,
  GRAVITY_Y,
  JUMP_VELOCITY,
  NEVER_SHOT_TICKS,
  SHOT_COOLDOWN_MS,
  STARTING_AMMO,
  TICK_RATE,
  TICK_SECONDS,
} from '../constants.ts';
import type { Vec2 } from '../geometry.ts';
import type { Level, Side } from '../levels/level-registry.ts';
import { moveBox } from '../physics/tile-collision.ts';
import type { InputFrame } from '../protocol/input.ts';
import { nextHorizontalVelocity, type Direction } from './horizontal-velocity.ts';
import { MOVEMENT } from './movement-tuning.ts';
import { bodyBox, hitboxCentreFromSprite, spriteCentre, type Facing } from './player-body.ts';

export type { Facing } from './player-body.ts';
export type PlayerId = string;
export type AnimationKey = 'idle' | 'run' | 'jump' | 'fall' | 'shoot';

/** Everything `stepPlayer` reads lives here, so snapshots carry it and reconciliation replays it. */
export interface PlayerState {
  id: PlayerId;
  side: Side;
  /** Hitbox centre. The sprite is drawn offset from it (see `spriteCentre`). */
  x: number;
  y: number;
  /** Carries momentum between ticks. */
  vx: number;
  vy: number;
  facing: Facing;
  onFloor: boolean;
  ammo: number;
  score: number;
  ticksSinceShot: number;
  /** Ticks left on a buffered jump press, 0 when none. */
  jumpBufferTicks: number;
  /** Ticks left of coyote time, 0 when none. */
  coyoteTicks: number;
  /** Ticks left of the shoot pose. */
  shotPoseTicks: number;
  anim: AnimationKey;
}

/** `id` is `${ownerId}:${seq}` of the input that fired it. */
export interface BulletState {
  id: string;
  ownerId: PlayerId;
  x: number;
  y: number;
  vx: number;
}

export interface PlayerStepResult {
  player: PlayerState;
  bullet: BulletState | null;
  jumped: boolean;
}

/** Players spawn facing the centre of the level. */
function spawnFacing(side: Side): Facing {
  return side === 'left' ? 'right' : 'left';
}

/**
 * Hitbox centre of a side's spawn. Converted with the spawn facing, whatever the player faces
 * now, so every spawn puts the hitbox in the same place and the first one draws the sprite on
 * the authored point.
 */
function spawnPoint(level: Level, side: Side): Vec2 {
  return hitboxCentreFromSprite(level.spawns[side], spawnFacing(side));
}

/** A fresh player at its side's spawn, at rest, with full starting ammo. */
export function createPlayer(id: PlayerId, side: Side, level: Level, score = 0): PlayerState {
  const { x, y } = spawnPoint(level, side);
  return {
    id,
    side,
    x,
    y,
    vx: 0,
    vy: 0,
    facing: spawnFacing(side),
    onFloor: false,
    ammo: STARTING_AMMO,
    score,
    ticksSinceShot: NEVER_SHOT_TICKS,
    jumpBufferTicks: 0,
    coyoteTicks: 0,
    shotPoseTicks: 0,
    anim: 'idle',
  };
}

/**
 * Puts a shot player back at its spawn, at rest. Momentum and pending jump timers are cleared
 * so it neither slides off nor jumps on arrival; floor contact is unknown until it next moves.
 * Facing, ammo, score and the shot cooldown carry over, as in the original.
 */
export function respawn(p: PlayerState, level: Level): PlayerState {
  const { x, y } = spawnPoint(level, p.side);
  return {
    ...p,
    x,
    y,
    vx: 0,
    vy: 0,
    onFloor: false,
    jumpBufferTicks: 0,
    coyoteTicks: 0,
    shotPoseTicks: 0,
  };
}

/** Animation for a player about to apply `input`; a shot shows only when it can fire. */
export function animationFor(p: PlayerState, input: InputFrame): AnimationKey {
  if (input.shootPressed && p.ammo > 0) return 'shoot';
  if (p.onFloor) return p.vx === 0 ? 'idle' : 'run';
  return p.vy > 0 ? 'fall' : 'jump';
}

/**
 * `ticks * TICK_MS > SHOT_COOLDOWN_MS`, cross-multiplied so it stays exact: in floating point
 * 60 * (1000 / 60) is 1000.0000000000001, which would let a shot through one tick early.
 */
function cooledDown(ticks: number): boolean {
  return ticks * 1000 > SHOT_COOLDOWN_MS * TICK_RATE;
}

/** Turns -0 into 0 so states compare and serialise cleanly. */
function zeroed(v: number): number {
  return v === 0 ? 0 : v;
}

function countDown(ticks: number): number {
  return Math.max(0, ticks - 1);
}

function tickTimers(p: PlayerState): PlayerState {
  return {
    ...p,
    ticksSinceShot: p.ticksSinceShot + 1,
    shotPoseTicks: countDown(p.shotPoseTicks),
    coyoteTicks: countDown(p.coyoteTicks),
    jumpBufferTicks: countDown(p.jumpBufferTicks),
  };
}

/** Left wins when both are held, as in the original. */
function directionOf(input: InputFrame): Direction {
  if (input.left) return -1;
  if (input.right) return 1;
  return 0;
}

/** Facing follows the held key at once, before momentum catches up, so a turn reads instantly. */
function facingFor(facing: Facing, direction: Direction): Facing {
  if (direction < 0) return 'left';
  if (direction > 0) return 'right';
  return facing;
}

/**
 * Fires from the gun (the sprite centre plus the muzzle drop) when the press lands with ammo
 * and the cooldown over. A refused press does nothing, not even the pose.
 */
function shoot(
  p: PlayerState,
  input: InputFrame,
): { player: PlayerState; bullet: BulletState | null } {
  if (!input.shootPressed || p.ammo <= 0 || !cooledDown(p.ticksSinceShot)) {
    return { player: p, bullet: null };
  }
  const gun = spriteCentre(p, p.facing);
  return {
    player: {
      ...p,
      ammo: p.ammo - 1,
      ticksSinceShot: 0,
      shotPoseTicks: MOVEMENT.shotPoseTicks,
    },
    bullet: {
      id: `${p.id}:${input.seq}`,
      ownerId: p.id,
      x: gun.x,
      y: gun.y + BULLET_SPAWN_OFFSET_Y,
      vx: p.facing === 'right' ? BULLET_SPEED : -BULLET_SPEED,
    },
  };
}

/**
 * Sweeps the hitbox through the level with this tick's velocities. Position moves by the box's
 * displacement rather than being rebuilt from the box, so a blocked axis keeps its exact value.
 */
function move(p: PlayerState, level: Level): PlayerState {
  const box = bodyBox(p);
  const r = moveBox(box, p.vx, p.vy, TICK_SECONDS, level.grid, MOVEMENT);
  return {
    ...p,
    x: p.x + (r.box.x - box.x),
    y: p.y + (r.box.y - box.y),
    vx: zeroed(r.vx),
    vy: zeroed(r.vy),
    onFloor: r.contacts.down,
  };
}

/** One 60 Hz tick for one player. Pure: returns a new state. */
export function stepPlayer(player: PlayerState, input: InputFrame, level: Level): PlayerStepResult {
  // 1. Timers count down before anything below can set one, so a fresh value lasts in full.
  let next = tickTimers(player);

  // 2. Animation, from the state before this tick's input is applied.
  next.anim = animationFor(player, input);

  // 3. Facing, before the shot so a bullet fired while turning leaves in the new direction.
  const direction = directionOf(input);
  next.facing = facingFor(player.facing, direction);

  // 4. Shoot, before the move: the bullet leaves from where the player was last drawn.
  const shot = shoot(next, input);
  next = shot.player;

  // 5. Horizontal momentum. Ground or air rates come from last tick's contact; this tick's is
  //    only known after the move.
  next.vx = nextHorizontalVelocity(player.vx, direction, player.onFloor);

  // 6. Jump, from the floor only, judged by last tick's contact for the same reason.
  const jumped = input.jumpPressed && player.onFloor;
  if (jumped) next.vy = JUMP_VELOCITY;

  // 7. Gravity after the jump, so the jump tick already includes one tick of it: that is what
  //    gives the original's 87.5 px apex.
  next.vy += GRAVITY_Y * TICK_SECONDS;

  // 8-9. Move and collide with this tick's velocities; the down contact becomes onFloor.
  next = move(next, level);

  return { player: next, bullet: shot.bullet, jumped };
}
