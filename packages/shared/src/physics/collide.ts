// Ported from Phaser 3.20.1 (MIT), © Richard Davey / Photon Storm
// Sources: src/physics/arcade/World.js (collideSpriteVsTilemapLayer, collideSpriteVsTilesHandler).
// Dropped: callbacks/events, overlap-only mode, scaled layers and base-tile-size adjustments
// (the layer sits at (0, 0) with scale 1 and tiles match the map's tile size).

import { TILE_BIAS } from '../constants.ts';
import { overlaps, type Rect } from '../geometry.ts';
import type { ArcadeBody } from './arcade-body.ts';
import { separateTile, tileIntersectsBody, type TileWorldRect } from './separate-tile.ts';
import { tilesWithin, type TileGrid } from './tile-grid.ts';

/**
 * Collides a body against the solid tiles of a grid, as `physics.add.collider(sprite, layer)`
 * did. Call it once per step, right after `integrate` and `clampToBounds`: the step's movement
 * (`x - prevX`, `y - prevY`) is read once up front, exactly like Phaser's fixed `_dx`/`_dy`.
 *
 * Candidate tiles are gathered from the body's box before any separation, then visited in
 * row-major order; each one is re-tested against the (possibly already moved) body.
 */
export function collideWithTiles(body: ArcadeBody, grid: TileGrid): void {
  const delta = { x: body.x - body.prevX, y: body.y - body.prevY };
  const tiles = tilesWithin(grid, body);
  const rect: TileWorldRect = { left: 0, top: 0, right: 0, bottom: 0 };

  for (const tile of tiles) {
    rect.left = tile.col * grid.tileWidth;
    rect.top = tile.row * grid.tileHeight;
    rect.right = rect.left + grid.tileWidth;
    rect.bottom = rect.top + grid.tileHeight;

    if (tileIntersectsBody(rect, body)) separateTile(body, tile, rect, TILE_BIAS, delta);
  }
}

/** True if `rect` strictly overlaps any solid tile. */
export function touchesSolidTile(rect: Rect, grid: TileGrid): boolean {
  return tilesWithin(grid, rect).some((tile) =>
    overlaps(rect, {
      x: tile.col * grid.tileWidth,
      y: tile.row * grid.tileHeight,
      width: grid.tileWidth,
      height: grid.tileHeight,
    }),
  );
}
