import { TILE_HEIGHT, TILE_WIDTH } from '@bng/shared';

/** level-tiles.png holds the 8 tiles in a 4 x 2 grid. */
const SHEET_COLUMNS = 4;
const TILE_CHARS = '.12345678';

/** Where tile `id` (1..8) sits in level-tiles.png. */
export function tileSource(id: number): { x: number; y: number; width: 32; height: 30 } {
  const index = id - 1;
  return {
    x: (index % SHEET_COLUMNS) * TILE_WIDTH,
    y: Math.floor(index / SHEET_COLUMNS) * TILE_HEIGHT,
    width: TILE_WIDTH as 32,
    height: TILE_HEIGHT as 30,
  };
}

/** The tile id at `index` of a summary's tile string ('.' and anything unknown are empty). */
export function tileIdAt(tiles: string, index: number): number {
  return Math.max(0, TILE_CHARS.indexOf(tiles[index] ?? '.'));
}
