import {
  BULLET_SPAWN_OFFSET_Y,
  BULLET_SPEED,
  GRAVITY_Y,
  JUMP_VELOCITY,
  NEVER_SHOT_TICKS,
  PLAYER_FRAME_HEIGHT,
  PLAYER_FRAME_WIDTH,
  PLAYER_SCALE,
  RUN_SPEED,
  SHOT_COOLDOWN_MS,
  STARTING_AMMO,
  TICK_RATE,
  TICK_SECONDS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../constants.ts';
import type { Rect } from '../geometry.ts';
import type { Level, ParkourZone, Side } from '../levels/level-registry.ts';
import { clampToBounds, integrate, type ArcadeBody } from '../physics/arcade-body.ts';
import { collideWithTiles } from '../physics/collide.ts';
import type { InputFrame } from '../protocol/input.ts';

export type PlayerId = string;
export type Facing = 'left' | 'right';
export type AnimationKey = 'idle' | 'run' | 'jump' | 'fall' | 'shoot';

export interface PlayerState {
  id: PlayerId;
  side: Side;
  /** Sprite centre (origin 0.5), as in the original game. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: Facing;
  /** True while the narrow parkour body is in use. */
  narrow: boolean;
  onFloor: boolean;
  ammo: number;
  score: number;
  ticksSinceShot: number;
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

interface BodyShape {
  /** Body size in source (unscaled) pixels. */
  width: number;
  height: number;
  /** Body offset in source pixels from the frame's top-left corner, per facing. */
  offsetX: Record<Facing, number>;
  offsetY: number;
}

// Values from the original game's setSize/setOffset calls (see the geometry table in the plan).
const NORMAL_SHAPE: BodyShape = {
  width: 12,
  height: 15,
  offsetX: { right: 2, left: 12 },
  offsetY: 8,
};
const NARROW_SHAPE: BodyShape = {
  width: 3,
  height: 15,
  offsetX: { right: 6, left: 18 },
  offsetY: 8,
};

// Origin 0.5: the sprite position is the frame centre.
const DISPLAY_ORIGIN_X = PLAYER_FRAME_WIDTH / 2;
const DISPLAY_ORIGIN_Y = PLAYER_FRAME_HEIGHT / 2;

export function createPlayer(id: PlayerId, side: Side, level: Level, score = 0): PlayerState {
  const spawn = level.spawns[side];
  return {
    id,
    side,
    x: spawn.x,
    y: spawn.y,
    vx: 0,
    vy: 0,
    facing: side === 'left' ? 'right' : 'left',
    narrow: false,
    onFloor: false,
    ammo: STARTING_AMMO,
    score,
    ticksSinceShot: NEVER_SHOT_TICKS,
    anim: 'idle',
  };
}

/** The arcade body box for a sprite at (x, y), following Phaser 3.20's Body.preUpdate. */
export function bodyBox(p: Pick<PlayerState, 'x' | 'y' | 'facing' | 'narrow'>): Rect {
  const shape = p.narrow ? NARROW_SHAPE : NORMAL_SHAPE;
  return {
    x: p.x + PLAYER_SCALE * (shape.offsetX[p.facing] - DISPLAY_ORIGIN_X),
    y: p.y + PLAYER_SCALE * (shape.offsetY - DISPLAY_ORIGIN_Y),
    width: PLAYER_SCALE * shape.width,
    height: PLAYER_SCALE * shape.height,
  };
}

/**
 * Inside the parkour zone the body is narrow. Outside it, the original only restored the normal
 * body while facing right, so facing left keeps whatever the player had.
 */
export function nextNarrow(p: PlayerState, zone: ParkourZone | null): boolean {
  if (zone && p.x > zone.minX && p.x < zone.maxX && p.y < zone.maxY) return true;
  return p.facing === 'right' ? false : p.narrow;
}

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

/**
 * One 60 Hz tick for one player. Pure: returns a new state. Phaser ran the arcade physics step and
 * then the scene update each frame; a tick here is one scene update (steps 1-6) followed by the
 * physics step that consumed its velocities on the next frame (step 7). Do not reorder.
 */
export function stepPlayer(player: PlayerState, input: InputFrame, level: Level): PlayerStepResult {
  const next: PlayerState = { ...player };

  // 1. Shot cooldown clock.
  next.ticksSinceShot = player.ticksSinceShot + 1;

  // 2. Body shape for the parkour zone.
  next.narrow = nextNarrow(player, level.parkourZone);

  // 3. Animation, from the state before this tick's input is applied.
  next.anim = animationFor(player, input);

  // 4. Jump.
  let jumped = false;
  if (input.jumpPressed && player.onFloor) {
    next.vy = JUMP_VELOCITY;
    jumped = true;
  }

  // 5. Shoot.
  let bullet: BulletState | null = null;
  if (input.shootPressed && next.ammo > 0 && cooledDown(next.ticksSinceShot)) {
    bullet = {
      id: `${player.id}:${input.seq}`,
      ownerId: player.id,
      x: player.x,
      y: player.y + BULLET_SPAWN_OFFSET_Y,
      vx: player.facing === 'right' ? BULLET_SPEED : -BULLET_SPEED,
    };
    next.ammo -= 1;
    next.ticksSinceShot = 0;
  }

  // 6. Horizontal movement.
  if (input.left) {
    next.vx = -RUN_SPEED;
    next.facing = 'left';
  } else if (input.right) {
    next.vx = RUN_SPEED;
    next.facing = 'right';
  } else {
    next.vx = 0;
  }

  // 7. Physics, with the body as it was positioned before this tick's facing change.
  const box = bodyBox({ x: player.x, y: player.y, facing: player.facing, narrow: next.narrow });
  const body: ArcadeBody = {
    ...box,
    vx: next.vx,
    vy: next.vy,
    prevX: box.x,
    prevY: box.y,
    blocked: { up: false, down: false, left: false, right: false },
  };
  integrate(body, GRAVITY_Y, TICK_SECONDS);
  clampToBounds(body, WORLD_WIDTH, WORLD_HEIGHT);
  collideWithTiles(body, level.grid);

  next.x = player.x + (body.x - box.x);
  next.y = player.y + (body.y - box.y);
  next.vx = zeroed(body.vx);
  next.vy = zeroed(body.vy);
  next.onFloor = body.blocked.down;

  return { player: next, bullet, jumped };
}
