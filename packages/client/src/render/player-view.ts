import type Phaser from 'phaser';
import { PLAYER_SCALE, type PlayerState } from '@bng/shared';
import { animationKeyFor } from '../assets/animations.ts';
import { TextureKey } from '../assets/manifest.ts';

export type PlayerSheet = 'player' | 'enemy';

/** One player sprite: the local player uses the player sheet, everyone else the enemy sheet. */
export class PlayerView {
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly sheet: PlayerSheet;

  constructor(scene: Phaser.Scene, sheet: PlayerSheet, state: PlayerState, depth: number) {
    this.sheet = sheet;
    this.sprite = scene.add
      .sprite(state.x, state.y, TextureKey[sheet])
      .setOrigin(0.5, 0.5)
      .setScale(PLAYER_SCALE, PLAYER_SCALE)
      .setDepth(depth);
    this.update(state);
  }

  update(state: PlayerState): void {
    this.sprite.setPosition(state.x, state.y);
    this.sprite.flipX = state.facing === 'left';
    this.sprite.play(animationKeyFor(this.sheet, state.anim), true);
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
