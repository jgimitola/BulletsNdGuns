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

function sweepX(box: Rect, dx: number, y: number, grid: TileGrid): AxisResult {
  return sweepAxis(
    box.x,
    box.width,
    dx,
    y,
    box.height,
    grid.tileWidth,
    grid.tileHeight,
    grid.cols,
    grid.rows,
    (col, row) => grid.isSolid(col, row),
  );
}

function sweepY(box: Rect, dy: number, x: number, grid: TileGrid): AxisResult {
  return sweepAxis(
    box.y,
    box.height,
    dy,
    x,
    box.width,
    grid.tileHeight,
    grid.tileWidth,
    grid.rows,
    grid.cols,
    (row, col) => grid.isSolid(col, row),
  );
}

/** True when the box lies inside the world and overlaps no solid tile (same EPS rule as the sweep). */
function isFree(grid: TileGrid, x: number, y: number, width: number, height: number): boolean {
  const { tileWidth: tw, tileHeight: th, cols, rows } = grid;
  if (x < -EPS || y < -EPS || x + width > cols * tw + EPS || y + height > rows * th + EPS) {
    return false;
  }
  const c0 = Math.max(0, Math.floor((x + EPS) / tw));
  const c1 = Math.min(cols - 1, Math.floor((x + width - EPS) / tw));
  const r0 = Math.max(0, Math.floor((y + EPS) / th));
  const r1 = Math.min(rows - 1, Math.floor((y + height - EPS) / th));
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) if (grid.isSolid(c, r)) return false;
  }
  return true;
}

/**
 * Head nudge: when a rising box clips a block corner, slide it sideways just enough to clear
 * it. Without this a jump that misses a one-tile gap by a few pixels dies on the lip, and a
 * 27.6 px body could never be relied on to rise through a 32 px gap. Returns the shifted x, or
 * null when no shift within `maxPx` leaves the box free both now and at its risen height.
 */
function headNudge(box: Rect, x: number, riseY: number, grid: TileGrid, maxPx: number): number | null {
  const tw = grid.tileWidth;
  // Shifts that put an edge exactly on the next tile boundary: the least that clears a column.
  const right = (Math.floor((x + EPS) / tw) + 1) * tw - x;
  const left = x + box.width - Math.floor((x + box.width - EPS) / tw) * tw;
  // Smaller shift first so the player moves as little as possible.
  const shifts = right <= left ? [right, -left] : [-left, right];
  for (const shift of shifts) {
    if (Math.abs(shift) > maxPx) continue;
    const nx = x + shift;
    if (
      isFree(grid, nx, box.y, box.width, box.height) &&
      isFree(grid, nx, riseY, box.width, box.height)
    ) {
      return nx;
    }
  }
  return null;
}

/**
 * Ledge catch: when a non-rising box walks into a ledge whose top is only a few pixels above
 * its feet, lift it onto the ledge instead of treating it as a wall. Arriving a hair low on a
 * jump then still lands the move rather than costing the player a full stop. Returns the
 * landed position, or null when the step is too tall or there is no room to stand on it.
 */
function ledgeCatch(
  box: Rect,
  dx: number,
  blocked: AxisResult,
  grid: TileGrid,
  maxPx: number,
): { x: number; y: number } | null {
  const { tileWidth: tw, tileHeight: th, cols, rows } = grid;
  const col =
    dx > 0
      ? Math.floor((blocked.pos + box.width + EPS) / tw)
      : Math.floor((blocked.pos - EPS) / tw);
  // A world-edge clamp is not a ledge.
  if (col < 0 || col >= cols) return null;

  const r0 = Math.max(0, Math.floor((box.y + EPS) / th));
  const r1 = Math.min(rows - 1, Math.floor((box.y + box.height - EPS) / th));
  for (let r = r0; r <= r1; r++) {
    if (!grid.isSolid(col, r)) continue;
    const step = box.y + box.height - r * th;
    if (step <= 0 || step > maxPx) return null;
    const y = r * th - box.height;
    if (!isFree(grid, box.x, y, box.width, box.height)) return null;
    const moved = sweepX(box, dx, y, grid);
    return moved.hitNegative || moved.hitPositive ? null : { x: moved.pos, y };
  }
  return null;
}

/**
 * Moves a box through the tile grid for one step: X first, then Y, each swept so nothing is
 * skipped at high speed. Stops flush against the first solid tile or world edge, zeroes that
 * axis' velocity and reports the contact. `assists` forgives near-miss corners (see
 * `headNudge` and `ledgeCatch`). Pure: the input box is never mutated.
 */
export function moveBox(
  box: Rect,
  vx: number,
  vy: number,
  dt: number,
  grid: TileGrid,
  assists: CornerAssists,
): MoveResult {
  const dx = vx * dt;
  const dy = vy * dt;
  let x = sweepX(box, dx, box.y, grid);
  let y: AxisResult;

  const blockedX = (dx > 0 && x.hitPositive) || (dx < 0 && x.hitNegative);
  const caught =
    blockedX && vy >= 0 && assists.ledgeCatchMaxPx > 0
      ? ledgeCatch(box, dx, x, grid, assists.ledgeCatchMaxPx)
      : null;

  if (caught) {
    x = { pos: caught.x, hitNegative: false, hitPositive: false };
    y = { pos: caught.y, hitNegative: false, hitPositive: true };
  } else {
    y = sweepY(box, dy, x.pos, grid);
    if (vy < 0 && y.hitNegative && assists.headNudgeMaxPx > 0) {
      const nx = headNudge(box, x.pos, box.y + dy, grid, assists.headNudgeMaxPx);
      if (nx !== null) {
        x = { ...x, pos: nx };
        y = sweepY(box, dy, nx, grid);
      }
    }
  }

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
