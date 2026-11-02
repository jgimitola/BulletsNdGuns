import { PLAYER_SCALE } from '../constants.ts';
import type { Rect, Vec2 } from '../geometry.ts';

/** Which way the sprite faces. Only the art and the gun follow it; the hitbox does not. */
export type Facing = 'left' | 'right';

/** Hitbox width: 12 source px, the original game's normal body. */
export const BODY_WIDTH = 12 * PLAYER_SCALE;
/** Hitbox height: 15 source px, the original game's normal body. */
export const BODY_HEIGHT = 15 * PLAYER_SCALE;

/**
 * Sprite centre minus hitbox centre, per facing: the art is not centred in its frame. Facing
 * right the body spans source px 2-14 of the 27 px frame; facing left the art is mirrored.
 */
export const SPRITE_OFFSET_X: Readonly<Record<Facing, number>> = Object.freeze({
  right: 5.5 * PLAYER_SCALE,
  left: -5.5 * PLAYER_SCALE,
});
/** The body spans source px 8-23 of the 23 px tall frame, so the sprite centre sits above it. */
export const SPRITE_OFFSET_Y = -4 * PLAYER_SCALE;

/** The player's hitbox, centred on `p` whatever the facing so turning never moves it. */
export function bodyBox(p: Readonly<Vec2>): Rect {
  return {
    x: p.x - BODY_WIDTH / 2,
    y: p.y - BODY_HEIGHT / 2,
    width: BODY_WIDTH,
    height: BODY_HEIGHT,
  };
}

/** Where the sprite's frame centre goes for a hitbox centred on `p`. */
export function spriteCentre(p: Readonly<Vec2>, facing: Facing): Vec2 {
  return { x: p.x + SPRITE_OFFSET_X[facing], y: p.y + SPRITE_OFFSET_Y };
}

/**
 * Inverse of `spriteCentre`: converts positions authored as sprite centres in the original
 * game (level spawns) to hitbox centres.
 */
export function hitboxCentreFromSprite(sprite: Readonly<Vec2>, facing: Facing): Vec2 {
  return { x: sprite.x - SPRITE_OFFSET_X[facing], y: sprite.y - SPRITE_OFFSET_Y };
}
