import type { LevelData } from '@bng/shared';

/**
 * The level's tiles as rows for `make.tilemap({ data })`. Phaser marks an empty cell with -1;
 * tile ids stay as they are, matched to the tileset by adding it with firstgid 1.
 */
export function toPhaserRows(data: LevelData): number[][] {
  const rows: number[][] = [];
  for (let r = 0; r < data.rows; r++) {
    const row = data.tiles.slice(r * data.cols, (r + 1) * data.cols);
    rows.push(row.map((t) => (t === 0 ? -1 : t)));
  }
  return rows;
}
