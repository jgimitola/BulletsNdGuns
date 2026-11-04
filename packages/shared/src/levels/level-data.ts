import { z } from 'zod';
import type { Vec2 } from '../geometry.ts';
import { parseWith } from '../validation.ts';

/** Every level is one screen: 25 x 20 tiles of 32 x 30 px (800 x 600). */
export const LEVEL_COLS = 25,
  LEVEL_ROWS = 20,
  TILE_WIDTH = 32,
  TILE_HEIGHT = 30;
/** Tile ids are 0 (empty) and 1..TILE_KINDS, the tiles of `level-tiles.png` in order. */
export const TILE_KINDS = 8;
export const MAX_PICKUPS_PER_KIND = 100;
/** Positions may overhang the level by half a tile (level 1's right spawn sits at x = 803). */
export const POSITION_MARGIN_X = TILE_WIDTH / 2,
  POSITION_MARGIN_Y = TILE_HEIGHT / 2;

export type Side = 'left' | 'right';

/**
 * A level as stored and sent. Positions are pixels: spawns are sprite centres, coins and ammo are
 * pickup anchors (see `coinRect` / `ammoPickupRect`), the portal is its image centre. A draft may
 * lack spawns or the portal; only a playable level can be tested, published or played.
 */
export interface LevelData {
  cols: number;
  rows: number;
  /** Row-major tile ids, `cols * rows` of them. Every non-empty tile is solid. */
  tiles: number[];
  spawns: { left: Vec2 | null; right: Vec2 | null };
  portal: Vec2 | null;
  coins: Vec2[];
  ammo: Vec2[];
}

export interface PlayableLevelData extends LevelData {
  spawns: Record<Side, Vec2>;
  portal: Vec2;
}

const TILE_COUNT = LEVEL_COLS * LEVEL_ROWS;
const MIN_X = -POSITION_MARGIN_X,
  MAX_X = LEVEL_COLS * TILE_WIDTH + POSITION_MARGIN_X;
const MIN_Y = -POSITION_MARGIN_Y,
  MAX_Y = LEVEL_ROWS * TILE_HEIGHT + POSITION_MARGIN_Y;

export const positionSchema = z.object({
  x: z.number().min(MIN_X).max(MAX_X),
  y: z.number().min(MIN_Y).max(MAX_Y),
}) satisfies z.ZodType<Vec2>;

/** Length first, then items: a huge array is refused without walking it. */
const positionsSchema = z
  .array(z.unknown())
  .max(MAX_PICKUPS_PER_KIND)
  .pipe(z.array(positionSchema));

const tilesSchema = z
  .array(z.unknown())
  .length(TILE_COUNT)
  .pipe(z.array(z.int().min(0).max(TILE_KINDS)));

/**
 * Tiles 5 and 6 of `level-tiles.png` are copies of the ammo and coin sprites, left over from the
 * original tileset. No level uses them as blocks; placed in the editor they looked like pickups
 * but stayed solid and could not be collected.
 */
export const AMMO_LOOKALIKE_TILE = 5,
  COIN_LOOKALIKE_TILE = 6;

/** A pickup's anchor for a cell: its bottom-left corner, as the classic levels place them. */
export function pickupAnchor(col: number, row: number): Vec2 {
  return { x: col * TILE_WIDTH, y: (row + 1) * TILE_HEIGHT };
}

/**
 * Replaces every look-alike tile with the pickup it shows, at that cell's anchor. A pickup already
 * there, or one past `MAX_PICKUPS_PER_KIND`, is not added; the tile is cleared either way.
 */
function lookalikeTilesToPickups(data: LevelData): LevelData {
  const coins = data.coins.slice(),
    ammo = data.ammo.slice();
  const tiles = data.tiles.map((id, index) => {
    const list = id === COIN_LOOKALIKE_TILE ? coins : id === AMMO_LOOKALIKE_TILE ? ammo : null;
    if (!list) return id;
    const anchor = pickupAnchor(index % data.cols, Math.floor(index / data.cols));
    const taken = list.some((p) => p.x === anchor.x && p.y === anchor.y);
    if (!taken && list.length < MAX_PICKUPS_PER_KIND) list.push(anchor);
    return 0;
  });
  return { ...data, tiles, coins, ammo };
}

/**
 * `null` spawns and portal are the missing pieces of a draft. Look-alike tiles become pickups, so
 * levels saved with them are repaired wherever they are read or written.
 */
export const levelDataSchema = z
  .object({
    cols: z.literal(LEVEL_COLS),
    rows: z.literal(LEVEL_ROWS),
    tiles: tilesSchema,
    spawns: z.object({ left: positionSchema.nullable(), right: positionSchema.nullable() }),
    portal: positionSchema.nullable(),
    coins: positionsSchema,
    ammo: positionsSchema,
  })
  .transform(lookalikeTilesToPickups) satisfies z.ZodType<LevelData>;

/** Validates untrusted level data. Returns a fresh LevelData, or null. Never throws. */
export function parseLevelData(raw: unknown): LevelData | null {
  return parseWith(levelDataSchema, raw);
}

/** Has what a match needs: both spawns and the portal. */
export function isPlayable(data: LevelData): data is PlayableLevelData {
  return data.spawns.left !== null && data.spawns.right !== null && data.portal !== null;
}

/** The character for each tile id, by index: '.' is empty. */
const TILE_CHARS = '.12345678';

/**
 * Tiles written as LEVEL_ROWS strings of LEVEL_COLS characters: '.' is empty, '1'..'8' a tile.
 * For levels written in code; throws on malformed rows.
 */
export function tilesFromRows(rows: readonly string[]): number[] {
  if (rows.length !== LEVEL_ROWS)
    throw new Error(`Expected ${LEVEL_ROWS} rows, got ${rows.length}`);
  const tiles: number[] = [];
  for (const [r, row] of rows.entries()) {
    if (row.length !== LEVEL_COLS) throw new Error(`Row ${r} has ${row.length} columns`);
    for (const char of row) {
      const id = TILE_CHARS.indexOf(char);
      if (id === -1) throw new Error(`Row ${r} has an invalid tile "${char}"`);
      tiles.push(id);
    }
  }
  return tiles;
}

export function tilesToRows(tiles: readonly number[]): string[] {
  const rows: string[] = [];
  for (let r = 0; r < LEVEL_ROWS; r++) {
    const row = tiles.slice(r * LEVEL_COLS, (r + 1) * LEVEL_COLS);
    rows.push(row.map((t) => TILE_CHARS[t]).join(''));
  }
  return rows;
}
