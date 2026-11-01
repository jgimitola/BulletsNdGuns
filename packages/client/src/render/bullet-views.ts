import type Phaser from 'phaser';
import { BULLET_SCALE, type BulletState } from '@bng/shared';
import { TextureKey } from '../assets/manifest.ts';

/** Bullet images keyed by bullet id, kept in step with whatever list is rendered. */
export class BulletViews {
  private readonly scene: Phaser.Scene;
  private readonly depth: number;
  private readonly views = new Map<string, Phaser.GameObjects.Image>();

  constructor(scene: Phaser.Scene, depth: number) {
    this.scene = scene;
    this.depth = depth;
  }

  sync(bullets: readonly BulletState[]): void {
    const live = new Set<string>();
    for (const b of bullets) {
      live.add(b.id);
      const view = this.views.get(b.id);
      if (view) {
        view.setPosition(b.x, b.y);
        continue;
      }
      this.views.set(
        b.id,
        this.scene.add
          .image(b.x, b.y, TextureKey.bullet)
          .setScale(BULLET_SCALE, BULLET_SCALE)
          .setDepth(this.depth),
      );
    }
    for (const [id, view] of this.views) {
      if (live.has(id)) continue;
      view.destroy();
      this.views.delete(id);
    }
  }
}
