import Phaser from 'phaser';
import {
  LEVEL_BACKGROUND,
  LEVEL_COLS,
  LEVEL_ROWS,
  PICKUP_DRAW_OFFSET_Y,
  PLAYER_SCALE,
  TILE_HEIGHT,
  TILE_WIDTH,
  TILESET_NAME,
  type LevelData,
  type Vec2,
} from '@bng/shared';
import { TextureKey } from '../assets/manifest.ts';
import type { EditorStore } from '../editor/editor-store.ts';
import { cellAt } from '../editor/level-edits.ts';
import { toolForKey } from '../editor/tools.ts';
import { Depth } from '../render/depth.ts';
import { getServices } from '../services.ts';

const GRID_ALPHA = 0.08;
const HOVER_COLOR = 0xffd23f;
const SPAWN_LABEL_COLOR = { left: '#ffd23f', right: '#ffffff' } as const;

/** Keys go to a text field or an open dialog, not to the editor. */
function keysBelongElsewhere(): boolean {
  const active = document.activeElement;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return true;
  return document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]') !== null;
}

/**
 * The level being edited, at real size with a faint grid. It turns pointer and key input into
 * editor store actions and redraws whatever the store says the level is; it never talks to the
 * network. The toolbar and dialogs are React (see ui/editor).
 */
export class EditorScene extends Phaser.Scene {
  constructor() {
    super('editor');
  }

  create(): void {
    const { ui } = getServices(this);
    const editor = ui.getState().editor;
    if (!editor) {
      this.scene.start('menu');
      return;
    }
    this.cameras.main.setBackgroundColor(LEVEL_BACKGROUND);
    const layer = this.createTileLayer();
    this.drawGrid();
    const objects = this.add.container(0, 0).setDepth(Depth.portal);
    const hover = this.add.graphics().setDepth(Depth.debug);

    let drawn: LevelData | null = null;
    const draw = (data: LevelData) => {
      for (let i = 0; i < data.tiles.length; i++) {
        if (drawn && drawn.tiles[i] === data.tiles[i]) continue;
        const col = i % LEVEL_COLS;
        const row = Math.floor(i / LEVEL_COLS);
        const id = data.tiles[i]!;
        if (id === 0) layer.removeTileAt(col, row);
        else layer.putTileAt(id, col, row);
      }
      if (!drawn || !sameObjects(drawn, data)) this.drawObjects(objects, data);
      drawn = data;
    };
    draw(editor.getState().data);

    const unsubscribeEditor = editor.subscribe((state) => draw(state.data));
    const unsubscribeUi = ui.subscribe((state) => {
      if (state.editor !== editor) this.scene.start('menu');
      else if (state.screen === 'editorTest') this.scene.start('test');
    });
    const stopInput = this.listenToInput(editor, hover);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unsubscribeEditor();
      unsubscribeUi();
      stopInput();
      // A stroke cut short by leaving still counts as one step.
      editor.getState().endStroke();
    });
  }

  private createTileLayer(): Phaser.Tilemaps.TilemapLayer {
    const map = this.make.tilemap({
      width: LEVEL_COLS,
      height: LEVEL_ROWS,
      tileWidth: TILE_WIDTH,
      tileHeight: TILE_HEIGHT,
    });
    // firstgid 1, as in the level scene: tile id 1 is the first tile of the image.
    const tileset = map.addTilesetImage(
      TILESET_NAME,
      TextureKey.levelTiles,
      TILE_WIDTH,
      TILE_HEIGHT,
      0,
      0,
      1,
    );
    if (!tileset) throw new Error(`Texture ${TextureKey.levelTiles} is missing`);
    const layer = map.createBlankLayer('tiles', tileset, 0, 0);
    if (!layer) throw new Error('The editor tile layer could not be created');
    return layer.setDepth(Depth.platforms);
  }

  private drawGrid(): void {
    const grid = this.add.graphics().setDepth(Depth.platforms);
    grid.lineStyle(1, 0xffffff, GRID_ALPHA);
    const width = LEVEL_COLS * TILE_WIDTH;
    const height = LEVEL_ROWS * TILE_HEIGHT;
    for (let col = 1; col < LEVEL_COLS; col++) {
      grid.lineBetween(col * TILE_WIDTH + 0.5, 0, col * TILE_WIDTH + 0.5, height);
    }
    for (let row = 1; row < LEVEL_ROWS; row++) {
      grid.lineBetween(0, row * TILE_HEIGHT + 0.5, width, row * TILE_HEIGHT + 0.5);
    }
  }

  /** Pickups as the level scene draws them, the portal, and the spawns as standing players. */
  private drawObjects(objects: Phaser.GameObjects.Container, data: LevelData): void {
    objects.removeAll(true);
    const pickup = (p: Vec2, texture: string) =>
      this.add.image(p.x, p.y - PICKUP_DRAW_OFFSET_Y, texture).setOrigin(0, 0);
    // Ammo boxes first, as in the level scene, so coins draw on top of them.
    for (const p of data.ammo) objects.add(pickup(p, TextureKey.ammoPickup));
    for (const p of data.coins) objects.add(pickup(p, TextureKey.coin));
    if (data.portal) objects.add(this.add.image(data.portal.x, data.portal.y, TextureKey.portal));
    for (const side of ['left', 'right'] as const) {
      const at = data.spawns[side];
      if (!at) continue;
      const sprite = this.add
        .sprite(at.x, at.y, side === 'left' ? TextureKey.player : TextureKey.enemy, 0)
        .setScale(PLAYER_SCALE, PLAYER_SCALE);
      // Players spawn facing the centre: the right one looks left.
      sprite.flipX = side === 'right';
      const label = this.add
        .text(at.x, sprite.getTopCenter().y - 2, side === 'left' ? 'L' : 'R', {
          fontFamily: 'Tiny5',
          fontSize: '16px',
          color: SPAWN_LABEL_COLOR[side],
          stroke: '#000000',
          strokeThickness: 4,
        })
        .setOrigin(0.5, 1);
      objects.add([sprite, label]);
    }
  }

  /** Pointer painting and keyboard shortcuts; returns what stops them. */
  private listenToInput(editor: EditorStore, hover: Phaser.GameObjects.Graphics): () => void {
    let painting = false;
    const showHover = (pointer: Phaser.Input.Pointer) => {
      hover.clear();
      const cell = cellAt(pointer.worldX, pointer.worldY);
      if (!cell) return;
      hover.lineStyle(2, HOVER_COLOR, 0.9);
      hover.strokeRect(
        cell.col * TILE_WIDTH + 1,
        cell.row * TILE_HEIGHT + 1,
        TILE_WIDTH - 2,
        TILE_HEIGHT - 2,
      );
    };
    const onDown = (pointer: Phaser.Input.Pointer) => {
      if (!pointer.leftButtonDown()) return;
      painting = true;
      editor.getState().beginStroke();
      editor.getState().paintAt(pointer.worldX, pointer.worldY);
    };
    const onMove = (pointer: Phaser.Input.Pointer) => {
      showHover(pointer);
      // Objects are placed by a click only; dragging paints tiles or erases.
      if (!painting || editor.getState().tool.kind === 'object') return;
      editor.getState().paintAt(pointer.worldX, pointer.worldY);
    };
    const onUp = () => {
      if (!painting) return;
      painting = false;
      editor.getState().endStroke();
    };
    const onOut = () => {
      hover.clear();
      onUp();
    };
    const onKey = (event: KeyboardEvent) => {
      if (keysBelongElsewhere()) return;
      const state = editor.getState();
      const key = event.key.toLowerCase();
      if (event.ctrlKey || event.metaKey) {
        if (key === 'z' && !event.shiftKey) state.undo();
        else if (key === 'y' || (key === 'z' && event.shiftKey)) state.redo();
        else return;
        event.preventDefault();
        return;
      }
      if (event.altKey) return;
      const tool = toolForKey(event.key);
      if (tool) state.setTool(tool);
    };

    const { POINTER_DOWN, POINTER_MOVE, POINTER_UP, GAME_OUT } = Phaser.Input.Events;
    this.input.on(POINTER_DOWN, onDown);
    this.input.on(POINTER_MOVE, onMove);
    this.input.on(POINTER_UP, onUp);
    this.input.on(GAME_OUT, onOut);
    // A plain window listener: nothing is captured from the HTML fields, and each press arrives
    // once (Phaser's keyboard plugin delivered some presses twice here).
    window.addEventListener('keydown', onKey);
    return () => {
      this.input.off(POINTER_DOWN, onDown);
      this.input.off(POINTER_MOVE, onMove);
      this.input.off(POINTER_UP, onUp);
      this.input.off(GAME_OUT, onOut);
      window.removeEventListener('keydown', onKey);
    };
  }
}

function sameObjects(a: LevelData, b: LevelData): boolean {
  return (
    a.coins === b.coins &&
    a.ammo === b.ammo &&
    a.portal === b.portal &&
    a.spawns.left === b.spawns.left &&
    a.spawns.right === b.spawns.right
  );
}
