import { useEffect, useRef } from 'react';
import { LEVEL_COLS, LEVEL_ROWS } from '@bng/shared';
import { tileIdAt, tileSource } from './thumbnail.ts';

/** Canvas pixels per tile: 25 x 20 tiles make 200 x 150, shown at 80 x 60. */
const CELL_WIDTH = 8;
const CELL_HEIGHT = 7.5;
const BACKGROUND = '#14182b';

let tileSheet: Promise<HTMLImageElement> | null = null;

/** The level tile sheet, loaded once for every thumbnail. */
function loadTileSheet(): Promise<HTMLImageElement> {
  tileSheet ??= new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('level-tiles.png failed to load'));
    image.src = 'assets/textures/level-tiles.png';
  });
  return tileSheet;
}

/** A small picture of a level, drawn from its tiles with the game's own tile art. */
export function LevelThumbnail({ tiles }: { tiles: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let live = true;
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    context.fillStyle = BACKGROUND;
    context.fillRect(0, 0, LEVEL_COLS * CELL_WIDTH, LEVEL_ROWS * CELL_HEIGHT);
    loadTileSheet().then(
      (sheet) => {
        if (!live) return;
        context.imageSmoothingEnabled = false;
        for (let i = 0; i < LEVEL_COLS * LEVEL_ROWS; i++) {
          const id = tileIdAt(tiles, i);
          if (id === 0) continue;
          const src = tileSource(id);
          const x = (i % LEVEL_COLS) * CELL_WIDTH;
          const y = Math.floor(i / LEVEL_COLS) * CELL_HEIGHT;
          context.drawImage(
            sheet,
            src.x,
            src.y,
            src.width,
            src.height,
            x,
            y,
            CELL_WIDTH,
            CELL_HEIGHT,
          );
        }
      },
      // Without the tile art the thumbnail stays a plain dark panel.
      () => {},
    );
    return () => {
      live = false;
    };
  }, [tiles]);
  return (
    <canvas
      ref={canvas}
      className="level-thumb"
      width={LEVEL_COLS * CELL_WIDTH}
      height={LEVEL_ROWS * CELL_HEIGHT}
      aria-hidden="true"
    />
  );
}
