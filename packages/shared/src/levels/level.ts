import type { Rect, Vec2 } from '../geometry.ts';
import { buildTileGridFromTiles, type TileGrid } from '../physics/tile-grid.ts';
import { TILE_SIZE, type PlayableLevelData, type Side } from './level-data.ts';

/** A coin or ammo box in a running level. Its id is its index in the level data. */
export interface Pickup {
  id: number;
  x: number;
  y: number;
}

/** A playable level ready for the simulation: its data plus the collision grid and pickups. */
export interface Level {
  data: PlayableLevelData;
  grid: TileGrid;
  /**
   * Sprite centres, as authored in the original game so they stay traceable to it;
   * `createPlayer` converts them to hitbox centres.
   */
  spawns: Record<Side, Vec2>;
  portal: Vec2;
  ammoPickups: readonly Pickup[];
  coins: readonly Pickup[];
}

export function buildLevel(data: PlayableLevelData): Level {
  return {
    data,
    grid: buildTileGridFromTiles(data.tiles, data.cols, data.rows, TILE_SIZE),
    spawns: data.spawns,
    portal: data.portal,
    ammoPickups: data.ammo.map(({ x, y }, id) => ({ id, x, y })),
    coins: data.coins.map(({ x, y }, id) => ({ id, x, y })),
  };
}

export function ammoPickupRect(p: Pickup): Rect {
  return { x: p.x + 11, y: p.y - 30, width: 10, height: 30 };
}

export function coinRect(p: Pickup): Rect {
  return { x: p.x + 4, y: p.y - 26, width: 25, height: 23 };
}

export function portalRect(level: { portal: Vec2 }): Rect {
  return { x: level.portal.x - 22, y: level.portal.y - 30, width: 44, height: 60 };
}
