// tilesWithin ported from Phaser 3.20.1 (MIT), © Richard Davey / Photon Storm
// Sources: src/tilemaps/components/GetTilesWithinWorldXY.js, GetTilesWithin.js,
// WorldToTileX.js / WorldToTileY.js.

import type { Rect } from '../geometry.ts';
import { decodeLayer, type TiledMap } from './tiled.ts';

export interface Tile {
  col: number;
  row: number;
}

export interface TileGrid {
  cols: number;
  rows: number;
  tileWidth: number;
  tileHeight: number;
  isSolid(col: number, row: number): boolean;
  tile(col: number, row: number): Tile | null;
}

/**
 * Builds the collision grid for a layer, as the original did with
 * `layer.setCollisionByExclusion(-1, true)`: every non-empty tile is solid.
 */
export function buildTileGrid(map: TiledMap, layerName: string): TileGrid {
  const gids = decodeLayer(map, layerName);
  const cols = map.width;
  const rows = map.height;

  const isSolid = (col: number, row: number): boolean =>
    col >= 0 && col < cols && row >= 0 && row < rows && gids[row * cols + col] !== 0;

  return {
    cols,
    rows,
    tileWidth: map.tilewidth,
    tileHeight: map.tileheight,
    isSolid,
    tile: (col, row) => (isSolid(col, row) ? { col, row } : null),
  };
}

/** The collision grid of a level's tiles (row-major ids): every non-empty tile is solid. */
export function buildTileGridFromTiles(
  tiles: readonly number[],
  cols: number,
  rows: number,
  tileWidth: number,
  tileHeight: number,
): TileGrid {
  const isSolid = (col: number, row: number): boolean =>
    col >= 0 && col < cols && row >= 0 && row < rows && tiles[row * cols + col] !== 0;

  return {
    cols,
    rows,
    tileWidth,
    tileHeight,
    isSolid,
    tile: (col, row) => (isSolid(col, row) ? { col, row } : null),
  };
}

/**
 * GetTilesWithinWorldXY for a layer at (0, 0) with scale 1: start columns/rows are floored,
 * end columns/rows are ceiled, the range is clipped to the map, and tiles are returned in
 * row-major order. Only solid tiles are returned.
 */
export function tilesWithin(grid: TileGrid, rect: Rect): Tile[] {
  let tileX = Math.floor(rect.x / grid.tileWidth);
  let tileY = Math.floor(rect.y / grid.tileHeight);
  let width = Math.ceil((rect.x + rect.width) / grid.tileWidth) - tileX;
  let height = Math.ceil((rect.y + rect.height) / grid.tileHeight) - tileY;

  if (tileX < 0) {
    width += tileX;
    tileX = 0;
  }
  if (tileY < 0) {
    height += tileY;
    tileY = 0;
  }
  if (tileX + width > grid.cols) width = Math.max(grid.cols - tileX, 0);
  if (tileY + height > grid.rows) height = Math.max(grid.rows - tileY, 0);

  const result: Tile[] = [];
  for (let row = tileY; row < tileY + height; row++) {
    for (let col = tileX; col < tileX + width; col++) {
      const tile = grid.tile(col, row);
      if (tile) result.push(tile);
    }
  }
  return result;
}
