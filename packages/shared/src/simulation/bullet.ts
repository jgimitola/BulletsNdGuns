import { BULLET_SCALE, BULLET_SIZE, TICK_SECONDS, WORLD_WIDTH } from '../constants.ts';
import type { Rect } from '../geometry.ts';
import type { Level } from '../levels/level.ts';
import { touchesSolidTile } from '../physics/tile-collision.ts';
import type { BulletState } from './player.ts';

const BULLET_EXTENT = BULLET_SIZE * BULLET_SCALE;

/** 6x6 box centred on the bullet. */
export function bulletBox(b: BulletState): Rect {
  return {
    x: b.x - BULLET_EXTENT / 2,
    y: b.y - BULLET_EXTENT / 2,
    width: BULLET_EXTENT,
    height: BULLET_EXTENT,
  };
}

/** Advances one tick. Returns null when the bullet hits a solid tile or leaves the world. */
export function stepBullet(b: BulletState, level: Level): BulletState | null {
  const next: BulletState = { ...b, x: b.x + b.vx * TICK_SECONDS };
  if (next.x < 0 || next.x > WORLD_WIDTH) return null;
  if (touchesSolidTile(bulletBox(next), level.grid)) return null;
  return next;
}
