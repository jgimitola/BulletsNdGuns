import type { Rect } from '../geometry.ts';
import type { TileGrid } from './tile-grid.ts';

/** Which sides of a box were blocked by a solid tile or the world edge this step. */
export interface Contacts {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

/** Forgiveness distances for near-miss corners, in pixels. Zero disables each assist. */
export interface CornerAssists {
  headNudgeMaxPx: number;
  ledgeCatchMaxPx: number;
}

/** Assists switched off: strict collision with no corner forgiveness. */
export const NO_ASSISTS: Readonly<CornerAssists> = Object.freeze({
  headNudgeMaxPx: 0,
  ledgeCatchMaxPx: 0,
});

export interface MoveResult {
  box: Rect;
  vx: number;
  vy: number;
  contacts: Contacts;
}

/**
 * Overlap ranges shrink by this much so a box resting flush against a tile does not count as
 * overlapping it; otherwise sliding along a floor would snag on float noise.
 */
const EPS = 1e-6;

interface AxisResult {
  pos: number;
  hitNegative: boolean;
  hitPositive: boolean;
}

/**
 * Sweeps one axis. `lo`/`size` describe the box on the moving axis and `crossLo`/`crossSize`
 * on the other; `solid(a, b)` takes the tile index along the moving axis, then across it.
 * Scanning every tile the leading edge crosses (rather than testing the end position) is what
 * stops fast fallers from tunnelling through thin platforms.
 */
function sweepAxis(
  lo: number,
  size: number,
  delta: number,
  crossLo: number,
  crossSize: number,
  tile: number,
  crossTile: number,
  count: number,
  crossCount: number,
  solid: (a: number, b: number) => boolean,
): AxisResult {
  const b0 = Math.max(0, Math.floor((crossLo + EPS) / crossTile));
  const b1 = Math.min(crossCount - 1, Math.floor((crossLo + crossSize - EPS) / crossTile));
  const blockedAt = (a: number): boolean => {
    for (let b = b0; b <= b1; b++) if (solid(a, b)) return true;
    return false;
  };

  let pos = lo + delta;
  let hitNegative = false;
  let hitPositive = false;

  if (delta > 0) {
    const first = Math.floor((lo + size - EPS) / tile) + 1;
    const last = Math.min(count - 1, Math.floor((lo + size + delta - EPS) / tile));
    for (let a = Math.max(first, 0); a <= last; a++) {
      if (blockedAt(a)) {
        pos = a * tile - size;
        hitPositive = true;
        break;
      }
    }
  } else if (delta < 0) {
    const first = Math.min(count, Math.floor((lo + EPS) / tile)) - 1;
    const last = Math.max(0, Math.floor((lo + delta + EPS) / tile));
    for (let a = first; a >= last; a--) {
      if (blockedAt(a)) {
        pos = (a + 1) * tile;
        hitNegative = true;
        break;
      }
    }
  }

  // Clamp even when delta is 0 so a box spawned partly outside the world is pulled back in.
  const max = count * tile - size;
  if (pos < 0) {
    pos = 0;
    hitNegative = true;
  } else if (pos > max) {
    pos = max;
    hitPositive = true;
  }
  return { pos, hitNegative, hitPositive };
}

/**
 * Moves a box through the tile grid for one step: X first, then Y, each swept so nothing is
 * skipped at high speed. Stops flush against the first solid tile or world edge, zeroes that
 * axis' velocity and reports the contact. Pure: the input box is never mutated.
 * `assists` is accepted for the corner-assist pass and currently ignored.
 */
export function moveBox(
  box: Rect,
  vx: number,
  vy: number,
  dt: number,
  grid: TileGrid,
  _assists: CornerAssists,
): MoveResult {
  void _assists;
  const x = sweepAxis(
    box.x,
    box.width,
    vx * dt,
    box.y,
    box.height,
    grid.tileWidth,
    grid.tileHeight,
    grid.cols,
    grid.rows,
    (col, row) => grid.isSolid(col, row),
  );
  const y = sweepAxis(
    box.y,
    box.height,
    vy * dt,
    x.pos,
    box.width,
    grid.tileHeight,
    grid.tileWidth,
    grid.rows,
    grid.cols,
    (row, col) => grid.isSolid(col, row),
  );

  return {
    box: { x: x.pos, y: y.pos, width: box.width, height: box.height },
    // Only the direction of travel cancels velocity; a clamp on the far side must not.
    vx: (vx > 0 && x.hitPositive) || (vx < 0 && x.hitNegative) ? 0 : vx,
    vy: (vy > 0 && y.hitPositive) || (vy < 0 && y.hitNegative) ? 0 : vy,
    contacts: {
      left: x.hitNegative,
      right: x.hitPositive,
      up: y.hitNegative,
      down: y.hitPositive,
    },
  };
}
