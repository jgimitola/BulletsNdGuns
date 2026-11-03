import type { Vec2 } from '../geometry.ts';

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

function asRecord(raw: unknown): Record<string, unknown> | null {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

function inRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function parsePosition(raw: unknown): Vec2 | null {
  const r = asRecord(raw);
  if (!r) return null;
  const { x, y } = r;
  return inRange(x, MIN_X, MAX_X) && inRange(y, MIN_Y, MAX_Y) ? { x, y } : null;
}

/** `null` stays null (a missing piece of a draft); anything else must be a valid position. */
function parseOptionalPosition(raw: unknown): Vec2 | null | undefined {
  return raw === null ? null : (parsePosition(raw) ?? undefined);
}

function parsePositions(raw: unknown): Vec2[] | null {
  // Length first, so a huge array is refused without walking it.
  if (!Array.isArray(raw) || raw.length > MAX_PICKUPS_PER_KIND) return null;
  const positions: Vec2[] = [];
  for (const item of raw) {
    const p = parsePosition(item);
    if (!p) return null;
    positions.push(p);
  }
  return positions;
}

function parseTiles(raw: unknown): number[] | null {
  if (!Array.isArray(raw) || raw.length !== TILE_COUNT) return null;
  const tiles: number[] = [];
  for (const t of raw) {
    if (!Number.isInteger(t) || (t as number) < 0 || (t as number) > TILE_KINDS) return null;
    tiles.push(t as number);
  }
  return tiles;
}

/** Validates untrusted level data. Returns a fresh LevelData, or null. Never throws. */
export function parseLevelData(raw: unknown): LevelData | null {
  try {
    const r = asRecord(raw);
    if (!r || r['cols'] !== LEVEL_COLS || r['rows'] !== LEVEL_ROWS) return null;
    const tiles = parseTiles(r['tiles']);
    const spawns = asRecord(r['spawns']);
    if (!tiles || !spawns) return null;
    const left = parseOptionalPosition(spawns['left']);
    const right = parseOptionalPosition(spawns['right']);
    const portal = parseOptionalPosition(r['portal']);
    const coins = parsePositions(r['coins']);
    const ammo = parsePositions(r['ammo']);
    if (left === undefined || right === undefined || portal === undefined || !coins || !ammo) {
      return null;
    }
    return {
      cols: LEVEL_COLS,
      rows: LEVEL_ROWS,
      tiles,
      spawns: { left, right },
      portal,
      coins,
      ammo,
    };
  } catch {
    return null;
  }
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
