import Phaser from 'phaser';
import { WORLD_HEIGHT, WORLD_WIDTH } from '@bng/shared';
import { formatPanel, type PanelData } from './panel-text.ts';
import { isTitleClick, loadPanelPrefs, savePanelPrefs, type PanelPrefs } from './panel-prefs.ts';

const PADDING = 6;
const MARGIN = 8;
const TEXT_STYLE = { fontFamily: 'monospace', fontSize: '11px', color: '#eeeeee' } as const;

/**
 * The debug readout, inside the canvas because a resized window guarantees no margin beside the
 * stage. Every spot covers part of some level, so it drags by its title and collapses on a click.
 */
export class DebugPanel {
  private readonly container: Phaser.GameObjects.Container;
  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly title: Phaser.GameObjects.Text;
  private readonly body: Phaser.GameObjects.Text;
  /** Measured once from the placeholder; the live text varies and must not resize the panel. */
  private readonly bodyWidth: number;
  private readonly bodyHeight: number;
  private prefs: PanelPrefs;
  private grabX = 0;
  private grabY = 0;

  constructor(scene: Phaser.Scene, depth: number) {
    this.background = scene.add.rectangle(0, 0, 1, 1, 0x000000, 0.7).setOrigin(0, 0);
    this.title = scene.add.text(PADDING, PADDING, '', { ...TEXT_STYLE, color: '#ffd23f' });
    this.body = scene.add.text(PADDING, 0, '', TEXT_STYLE);
    this.container = scene.add
      .container(0, 0, [this.background, this.title, this.body])
      .setDepth(depth);

    // Sized from a full readout so the first placement keeps the expanded panel on screen.
    this.body.setText(EMPTY_BODY);
    this.bodyWidth = this.body.width;
    this.bodyHeight = this.body.height;
    this.layout(false);
    this.prefs = loadPanelPrefs(
      localStorage,
      { x: MARGIN, y: WORLD_HEIGHT - this.background.height - MARGIN, collapsed: false },
      { width: WORLD_WIDTH, height: WORLD_HEIGHT },
    );
    this.layout(this.prefs.collapsed);
    this.moveTo(this.prefs.x, this.prefs.y);

    this.title.setInteractive({ draggable: true, useHandCursor: true });
    const { Events } = Phaser.Input;
    this.title.on(Events.GAMEOBJECT_DRAG_START, (pointer: Phaser.Input.Pointer) => {
      this.grabX = pointer.x - this.container.x;
      this.grabY = pointer.y - this.container.y;
    });
    this.title.on(Events.GAMEOBJECT_DRAG, (pointer: Phaser.Input.Pointer) => {
      this.moveTo(pointer.x - this.grabX, pointer.y - this.grabY);
    });
    this.title.on(Events.GAMEOBJECT_DRAG_END, () => this.save());
    this.title.on(Events.GAMEOBJECT_POINTER_UP, (pointer: Phaser.Input.Pointer) => {
      if (!isTitleClick(pointer.downX, pointer.downY, pointer.upX, pointer.upY)) return;
      this.layout(!this.prefs.collapsed);
      // Collapsing or expanding changes the size, which may push the panel past an edge.
      this.moveTo(this.container.x, this.container.y);
      this.save();
    });
  }

  update(data: PanelData): void {
    if (this.prefs.collapsed) return;
    const text = formatPanel(data).join('\n');
    // Setting text re-renders its texture, so only do it when something changed.
    if (this.body.text !== text) this.body.setText(text);
  }

  destroy(): void {
    this.container.destroy();
  }

  private layout(collapsed: boolean): void {
    this.prefs = { ...this.prefs, collapsed };
    this.title.setText(collapsed ? 'debug ▸' : 'debug ▾');
    this.body.setVisible(!collapsed).setY(this.title.y + this.title.height + 2);
    const width = Math.max(this.title.width, collapsed ? 0 : this.bodyWidth) + PADDING * 2;
    const height =
      (collapsed ? this.title.y + this.title.height : this.body.y + this.bodyHeight) + PADDING;
    this.background.setSize(width, height);
  }

  /** Keeps the whole panel inside the canvas. */
  private moveTo(x: number, y: number): void {
    const maxX = WORLD_WIDTH - this.background.width;
    const maxY = WORLD_HEIGHT - this.background.height;
    this.container.setPosition(
      Math.round(Math.min(Math.max(x, 0), maxX)),
      Math.round(Math.min(Math.max(y, 0), maxY)),
    );
    this.prefs = { ...this.prefs, x: this.container.x, y: this.container.y };
  }

  private save(): void {
    savePanelPrefs(localStorage, this.prefs);
  }
}

/**
 * Placeholder with the readout's shape for sizing: 11 lines as wide as the longest one gets
 * (`assist  ledge catch +12px (29 ticks ago)`, 40 characters). The background keeps this size, so
 * the panel does not twitch as values change. Not spaces: text measurement ignores trailing
 * whitespace, which would size it to nothing.
 */
const EMPTY_BODY = Array.from({ length: 11 }, () => '0'.repeat(40)).join('\n');
