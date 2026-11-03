import { PLATFORM_LAYER } from '../constants.ts';
import type { Rect, Vec2 } from '../geometry.ts';
import type { TiledMap } from '../physics/tiled.ts';
import { buildTileGrid, type TileGrid } from '../physics/tile-grid.ts';
import level1Map from './maps/level-1.json' with { type: 'json' };
import level2Map from './maps/level-2.json' with { type: 'json' };
import level3Map from './maps/level-3.json' with { type: 'json' };

import type { Side } from './level-data.ts';

export type { Side };

/** Raw pickup coordinates (top-left origin), from `coleccionables.json` on branch `archive/original`. */
export interface Pickup {
  id: number;
  x: number;
  y: number;
}

export interface LevelConfig {
  index: number;
  tilemapKey: string;
  map: TiledMap;
  /**
   * Sprite centres, as authored in the original game so they stay traceable to it;
   * `createPlayer` converts them to hitbox centres.
   */
  spawns: Record<Side, Vec2>;
  portal: Vec2;
  ammoPickups: readonly Pickup[];
  coins: readonly Pickup[];
}

export interface Level extends LevelConfig {
  grid: TileGrid;
}

export const LEVELS: readonly LevelConfig[] = [
  {
    index: 0,
    tilemapKey: 'level-1',
    map: level1Map,
    spawns: { left: { x: 13, y: 514 }, right: { x: 803, y: 514 } },
    portal: { x: 704, y: 60 },
    ammoPickups: [
      { id: 1, x: 416, y: 540 },
      { id: 2, x: 352, y: 540 },
      { id: 3, x: 384, y: 540 },
      { id: 4, x: 256, y: 90 },
      { id: 5, x: 768, y: 390 },
      { id: 6, x: 0, y: 390 },
    ],
    coins: [
      { id: 1, x: 704, y: 540 },
      { id: 2, x: 64, y: 540 },
      { id: 3, x: 384, y: 360 },
      { id: 4, x: 384, y: 390 },
      { id: 5, x: 384, y: 420 },
      { id: 6, x: 224, y: 480 },
      { id: 7, x: 544, y: 480 },
      { id: 8, x: 160, y: 210 },
      { id: 9, x: 608, y: 210 },
      { id: 10, x: 384, y: 90 },
      { id: 11, x: 448, y: 90 },
      { id: 12, x: 512, y: 90 },
    ],
  },
  {
    index: 1,
    tilemapKey: 'level-2',
    map: level2Map,
    spawns: { left: { x: 96, y: 546 }, right: { x: 709, y: 543 } },
    portal: { x: 32, y: 60 },
    ammoPickups: [
      { id: 1, x: 384, y: 390 },
      { id: 2, x: 64, y: 450 },
      { id: 3, x: 704, y: 450 },
      { id: 4, x: 736, y: 210 },
      { id: 5, x: 32, y: 210 },
      { id: 6, x: 384, y: 300 },
    ],
    coins: [
      { id: 1, x: 448, y: 572 },
      { id: 2, x: 417, y: 572 },
      { id: 3, x: 385, y: 572 },
      { id: 4, x: 353, y: 572 },
      { id: 5, x: 322, y: 572 },
      { id: 6, x: 353, y: 541 },
      { id: 7, x: 385, y: 541 },
      { id: 8, x: 416, y: 541 },
      { id: 9, x: 384, y: 509 },
      { id: 10, x: 64, y: 119 },
      { id: 11, x: 97, y: 151 },
      { id: 12, x: 449, y: 209 },
      { id: 13, x: 480, y: 211 },
    ],
  },
  {
    index: 2,
    tilemapKey: 'level-3',
    map: level3Map,
    spawns: { left: { x: 64, y: 540 }, right: { x: 736, y: 540 } },
    portal: { x: 416, y: 60 },
    ammoPickups: [
      { id: 1, x: 736, y: 150 },
      { id: 2, x: 384, y: 180 },
      { id: 3, x: 32, y: 150 },
      { id: 30, x: 320, y: 510 },
      { id: 5, x: 448, y: 510 },
      { id: 6, x: 736, y: 480 },
      { id: 7, x: 32, y: 480 },
    ],
    coins: [
      { id: 1, x: 641, y: 211 },
      { id: 2, x: 129, y: 211 },
      { id: 3, x: 385, y: 331 },
      { id: 17, x: 576, y: 451 },
      { id: 5, x: 192, y: 451 },
    ],
  },
];

const gridCache = new Map<number, Level>();

export function getLevel(index: number): Level {
  const cached = gridCache.get(index);
  if (cached) return cached;
  const config = LEVELS[index];
  if (!config) throw new RangeError(`Level index out of range: ${index}`);
  const level: Level = { ...config, grid: buildTileGrid(config.map, PLATFORM_LAYER) };
  gridCache.set(index, level);
  return level;
}

export function isLastLevel(index: number): boolean {
  return index === LEVELS.length - 1;
}

export function ammoPickupRect(p: Pickup): Rect {
  return { x: p.x + 11, y: p.y - 30, width: 10, height: 30 };
}

export function coinRect(p: Pickup): Rect {
  return { x: p.x + 4, y: p.y - 26, width: 25, height: 23 };
}

export function portalRect(level: LevelConfig): Rect {
  return { x: level.portal.x - 22, y: level.portal.y - 30, width: 44, height: 60 };
}
