import {
  BODY_HEIGHT,
  hitboxCentreFromSprite,
  LEVEL_COLS,
  LEVEL_ROWS,
  MAX_PICKUPS_PER_KIND,
  spawnFacing,
  spriteCentre,
  TILE_HEIGHT,
  TILE_WIDTH,
  type LevelData,
  type Side,
  type Vec2,
} from '@bng/shared';
import type { ObjectTool, Tool } from './tools.ts';

export interface Cell {
  col: number;
  row: number;
}

/** A blank draft: no tiles, no spawns, no portal, no pickups. */
export function emptyLevel(): LevelData {
  return {
    cols: LEVEL_COLS,
    rows: LEVEL_ROWS,
    tiles: Array<number>(LEVEL_COLS * LEVEL_ROWS).fill(0),
    spawns: { left: null, right: null },
    portal: null,
    coins: [],
    ammo: [],
  };
}

/** The cell under a world pixel, or null outside the level. */
export function cellAt(x: number, y: number): Cell | null {
  const col = Math.floor(x / TILE_WIDTH);
  const row = Math.floor(y / TILE_HEIGHT);
  if (col < 0 || col >= LEVEL_COLS || row < 0 || row >= LEVEL_ROWS) return null;
  return { col, row };
}

const sideOf = (object: 'spawnLeft' | 'spawnRight'): Side =>
  object === 'spawnLeft' ? 'left' : 'right';

/**
 * Where an object placed in a cell goes, in the classic levels' conventions: a pickup's anchor is
 * the cell's bottom-left corner, the portal covers the cell and its right and lower neighbours,
 * and a spawn's hitbox stands on the cell's floor without touching the cell below.
 */
export function snapObject(object: ObjectTool, cell: Cell): Vec2 {
  const left = cell.col * TILE_WIDTH;
  const floor = (cell.row + 1) * TILE_HEIGHT;
  switch (object) {
    case 'coin':
    case 'ammo':
      return { x: left, y: floor };
    case 'portal':
      return { x: left + TILE_WIDTH, y: floor };
    case 'spawnLeft':
    case 'spawnRight':
      return spriteCentre(
        { x: left + TILE_WIDTH / 2, y: floor - BODY_HEIGHT / 2 - 1 },
        spawnFacing(sideOf(object)),
      );
  }
}

/**
 * Every cell on the straight line from `from` to `to`, both included, each one next to the one
 * before (Bresenham). A fast drag samples the pointer far apart; this fills the cells in between.
 */
export function cellsOnLine(from: Cell, to: Cell): Cell[] {
  const cells: Cell[] = [];
  const dCol = Math.abs(to.col - from.col);
  const dRow = -Math.abs(to.row - from.row);
  const stepCol = from.col < to.col ? 1 : -1;
  const stepRow = from.row < to.row ? 1 : -1;
  let error = dCol + dRow;
  let { col, row } = from;
  for (;;) {
    cells.push({ col, row });
    if (col === to.col && row === to.row) return cells;
    const twice = 2 * error;
    if (twice >= dRow) {
      error += dRow;
      col += stepCol;
    }
    if (twice <= dCol) {
      error += dCol;
      row += stepRow;
    }
  }
}

const clampCell = (col: number, row: number): Cell => ({
  col: Math.min(Math.max(col, 0), LEVEL_COLS - 1),
  row: Math.min(Math.max(row, 0), LEVEL_ROWS - 1),
});

/**
 * The cell an object belongs to: the inverse of `snapObject`, taken from the object's centre (the
 * hitbox's bottom for a spawn) so off-grid classic objects land in the cell they sit in. Clamped
 * into the grid for the objects that overhang the level.
 */
export function objectCell(object: ObjectTool, position: Readonly<Vec2>): Cell {
  switch (object) {
    case 'coin':
    case 'ammo':
      return clampCell(
        Math.floor((position.x + TILE_WIDTH / 2) / TILE_WIDTH),
        Math.floor((position.y - TILE_HEIGHT / 2) / TILE_HEIGHT),
      );
    case 'portal':
      return clampCell(
        Math.floor((position.x - TILE_WIDTH / 2) / TILE_WIDTH),
        Math.floor((position.y - TILE_HEIGHT / 2) / TILE_HEIGHT),
      );
    case 'spawnLeft':
    case 'spawnRight': {
      const hitbox = hitboxCentreFromSprite(position, spawnFacing(sideOf(object)));
      return clampCell(
        Math.floor(hitbox.x / TILE_WIDTH),
        Math.floor((hitbox.y + BODY_HEIGHT / 2) / TILE_HEIGHT),
      );
    }
  }
}

const sameCell = (a: Cell, b: Cell) => a.col === b.col && a.row === b.row;
const samePosition = (a: Vec2, b: Vec2) => a.x === b.x && a.y === b.y;

function addPickup(list: readonly Vec2[], position: Vec2): Vec2[] | null {
  if (list.length >= MAX_PICKUPS_PER_KIND) return null;
  if (list.some((p) => samePosition(p, position))) return null;
  return [...list, position];
}

function placeObject(data: LevelData, object: ObjectTool, cell: Cell): LevelData {
  const position = snapObject(object, cell);
  switch (object) {
    case 'coin': {
      const coins = addPickup(data.coins, position);
      return coins ? { ...data, coins } : data;
    }
    case 'ammo': {
      const ammo = addPickup(data.ammo, position);
      return ammo ? { ...data, ammo } : data;
    }
    case 'portal':
      return data.portal && samePosition(data.portal, position)
        ? data
        : { ...data, portal: position };
    case 'spawnLeft':
    case 'spawnRight': {
      const side = sideOf(object);
      const current = data.spawns[side];
      if (current && samePosition(current, position)) return data;
      return { ...data, spawns: { ...data.spawns, [side]: position } };
    }
  }
}

function erase(data: LevelData, cell: Cell): LevelData {
  const index = cell.row * LEVEL_COLS + cell.col;
  const keep = (object: ObjectTool) => (p: Vec2) => !sameCell(objectCell(object, p), cell);
  const hits = (object: ObjectTool, p: Vec2 | null) =>
    p !== null && sameCell(objectCell(object, p), cell);
  const coins = data.coins.filter(keep('coin'));
  const ammo = data.ammo.filter(keep('ammo'));
  const portal = hits('portal', data.portal) ? null : data.portal;
  const left = hits('spawnLeft', data.spawns.left) ? null : data.spawns.left;
  const right = hits('spawnRight', data.spawns.right) ? null : data.spawns.right;
  const changed =
    data.tiles[index] !== 0 ||
    coins.length !== data.coins.length ||
    ammo.length !== data.ammo.length ||
    portal !== data.portal ||
    left !== data.spawns.left ||
    right !== data.spawns.right;
  if (!changed) return data;
  const tiles = data.tiles.slice();
  tiles[index] = 0;
  return { ...data, tiles, coins, ammo, portal, spawns: { left, right } };
}

/**
 * Applies a tool to one cell. Pure: never mutates `data`, and returns `data` itself when nothing
 * changes. A pickup that would exceed `MAX_PICKUPS_PER_KIND`, or repeat one already there, is not
 * added.
 */
export function applyTool(data: LevelData, tool: Tool, cell: Cell): LevelData {
  if (tool.kind === 'eraser') return erase(data, cell);
  if (tool.kind === 'object') return placeObject(data, tool.object, cell);
  const index = cell.row * LEVEL_COLS + cell.col;
  if (data.tiles[index] === tool.id) return data;
  const tiles = data.tiles.slice();
  tiles[index] = tool.id;
  return { ...data, tiles };
}
