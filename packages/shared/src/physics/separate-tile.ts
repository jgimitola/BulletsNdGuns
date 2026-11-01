// Ported from Phaser 3.20.1 (MIT), © Richard Davey / Photon Storm
// Sources: src/physics/arcade/tilemap/SeparateTile.js, TileCheckX.js, TileCheckY.js,
// ProcessTileSeparationX.js, ProcessTileSeparationY.js, TileIntersectsBody.js.
// Always the tilemap-layer path (isLayer = true). Dropped: bounce (always 0, so the separated
// velocity is 0), customSeparateX/Y, checkCollision flags (all true), per-tile collide flags
// (every solid tile collides on all sides via setCollisionByExclusion).

import type { ArcadeBody } from './arcade-body.ts';
import type { Tile } from './tile-grid.ts';

export interface TileWorldRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The body's movement for this step, i.e. Phaser's `body._dx` / `body._dy`. Phaser fixes these
 * at the end of `Body.update` (after the world-bounds clamp) and does not change them while
 * separating, so they must be captured once before the tile loop.
 */
export interface BodyDelta {
  x: number;
  y: number;
}

export function tileIntersectsBody(rect: TileWorldRect, body: ArcadeBody): boolean {
  return !(
    body.x + body.width <= rect.left ||
    body.y + body.height <= rect.top ||
    body.x >= rect.right ||
    body.y >= rect.bottom
  );
}

function processTileSeparationX(body: ArcadeBody, x: number): void {
  if (x < 0) body.blocked.left = true;
  else if (x > 0) body.blocked.right = true;
  body.x -= x;
  body.vx = 0;
}

function processTileSeparationY(body: ArcadeBody, y: number): void {
  if (y < 0) body.blocked.up = true;
  else if (y > 0) body.blocked.down = true;
  body.y -= y;
  body.vy = 0;
}

function tileCheckX(
  body: ArcadeBody,
  tile: Tile,
  tileLeft: number,
  tileRight: number,
  tileBias: number,
  delta: BodyDelta,
): number {
  let ox = 0;

  if (delta.x < 0) {
    if (tile.faceRight && body.x < tileRight) {
      ox = body.x - tileRight;
      if (ox < -tileBias) ox = 0;
    }
  } else if (delta.x > 0) {
    const right = body.x + body.width;
    if (tile.faceLeft && right > tileLeft) {
      ox = right - tileLeft;
      if (ox > tileBias) ox = 0;
    }
  }

  if (ox !== 0) processTileSeparationX(body, ox);
  return ox;
}

function tileCheckY(
  body: ArcadeBody,
  tile: Tile,
  tileTop: number,
  tileBottom: number,
  tileBias: number,
  delta: BodyDelta,
): number {
  let oy = 0;

  if (delta.y < 0) {
    if (tile.faceBottom && body.y < tileBottom) {
      oy = body.y - tileBottom;
      if (oy < -tileBias) oy = 0;
    }
  } else if (delta.y > 0) {
    const bottom = body.y + body.height;
    if (tile.faceTop && bottom > tileTop) {
      oy = bottom - tileTop;
      if (oy > tileBias) oy = 0;
    }
  }

  if (oy !== 0) processTileSeparationY(body, oy);
  return oy;
}

/** Separates `body` from one tile. Returns true if the body was separated (or stopped touching). */
export function separateTile(
  body: ArcadeBody,
  tile: Tile,
  rect: TileWorldRect,
  tileBias: number,
  delta: BodyDelta,
): boolean {
  const { left: tileLeft, top: tileTop, right: tileRight, bottom: tileBottom } = rect;
  const faceHorizontal = tile.faceLeft || tile.faceRight;
  const faceVertical = tile.faceTop || tile.faceBottom;

  if (!faceHorizontal && !faceVertical) return false;

  let ox = 0;
  let oy = 0;
  let minX = 0;
  let minY = 1;

  const deltaAbsX = delta.x > 0 ? delta.x : -delta.x;
  const deltaAbsY = delta.y > 0 ? delta.y : -delta.y;

  if (deltaAbsX > deltaAbsY) minX = -1;
  else if (deltaAbsX < deltaAbsY) minY = -1;

  if (delta.x !== 0 && delta.y !== 0 && faceHorizontal && faceVertical) {
    minX = Math.min(Math.abs(body.x - tileRight), Math.abs(body.x + body.width - tileLeft));
    minY = Math.min(Math.abs(body.y - tileBottom), Math.abs(body.y + body.height - tileTop));
  }

  if (minX < minY) {
    if (faceHorizontal) {
      ox = tileCheckX(body, tile, tileLeft, tileRight, tileBias, delta);
      if (ox !== 0 && !tileIntersectsBody(rect, body)) return true;
    }
    if (faceVertical) {
      oy = tileCheckY(body, tile, tileTop, tileBottom, tileBias, delta);
    }
  } else {
    if (faceVertical) {
      oy = tileCheckY(body, tile, tileTop, tileBottom, tileBias, delta);
      if (oy !== 0 && !tileIntersectsBody(rect, body)) return true;
    }
    if (faceHorizontal) {
      ox = tileCheckX(body, tile, tileLeft, tileRight, tileBias, delta);
    }
  }

  return ox !== 0 || oy !== 0;
}
