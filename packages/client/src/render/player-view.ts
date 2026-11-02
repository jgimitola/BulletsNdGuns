import type Phaser from 'phaser';
import {
  PLAYER_FRAME_HEIGHT,
  PLAYER_SCALE,
  SPRITE_OFFSET_Y,
  WORLD_WIDTH,
  spriteCentre,
  type PlayerState,
} from '@bng/shared';
import { animationKeyFor } from '../assets/animations.ts';
import { TextureKey } from '../assets/manifest.ts';

export type PlayerSheet = 'player' | 'enemy';

const NICKNAME_FONT_SIZE = 16;
/** CSS font shorthand of the nickname labels, also used to preload the font. */
export const NICKNAME_FONT = `${NICKNAME_FONT_SIZE}px Tiny5`;
const NICKNAME_COLOR: Record<PlayerSheet, string> = { player: '#ffd23f', enemy: '#ffffff' };
/** Gap between the top of the sprite and the bottom of its label. */
const NICKNAME_GAP = 2;
const NICKNAME_OFFSET_Y = (PLAYER_FRAME_HEIGHT * PLAYER_SCALE) / 2 + NICKNAME_GAP;

/**
 * One player sprite with its nickname above it: the local player uses the player sheet and a gold
 * name, everyone else the enemy sheet and a white name.
 */
export class PlayerView {
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly label: Phaser.GameObjects.Text;
  private readonly sheet: PlayerSheet;

  constructor(
    scene: Phaser.Scene,
    sheet: PlayerSheet,
    state: PlayerState,
    nickname: string,
    depth: number,
    labelDepth: number,
  ) {
    this.sheet = sheet;
    const at = spriteCentre(state, state.facing);
    this.sprite = scene.add
      .sprite(at.x, at.y, TextureKey[sheet])
      .setOrigin(0.5, 0.5)
      .setScale(PLAYER_SCALE, PLAYER_SCALE)
      .setDepth(depth);
    this.label = scene.add
      .text(state.x, state.y, nickname, {
        fontFamily: 'Tiny5',
        fontSize: `${NICKNAME_FONT_SIZE}px`,
        color: NICKNAME_COLOR[sheet],
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1)
      .setDepth(labelDepth);
    this.update(state);
  }

  update(state: PlayerState): void {
    const at = spriteCentre(state, state.facing);
    this.sprite.setPosition(at.x, at.y);
    this.sprite.flipX = state.facing === 'left';
    this.sprite.play(animationKeyFor(this.sheet, state.anim), true);
    // The label follows the hitbox centre so it does not jump on turn. Players spawn at the
    // world's edges: keep the whole name on screen. Whole pixels keep it crisp.
    const half = this.label.width / 2;
    const x = Math.min(Math.max(state.x, half), WORLD_WIDTH - half);
    this.label.setPosition(Math.round(x), Math.round(state.y + SPRITE_OFFSET_Y - NICKNAME_OFFSET_Y));
  }

  destroy(): void {
    this.sprite.destroy();
    this.label.destroy();
  }
}
