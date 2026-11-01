import type Phaser from 'phaser';
import { PICKUP_DRAW_OFFSET_Y, type LevelConfig, type Pickup } from '@bng/shared';
import { TextureKey } from '../assets/manifest.ts';

function createImages(
  scene: Phaser.Scene,
  pickups: readonly Pickup[],
  texture: string,
  depth: number,
): Map<number, Phaser.GameObjects.Image> {
  const images = new Map<number, Phaser.GameObjects.Image>();
  for (const p of pickups) {
    images.set(
      p.id,
      scene.add
        .image(p.x, p.y - PICKUP_DRAW_OFFSET_Y, texture)
        .setOrigin(0, 0)
        .setDepth(depth),
    );
  }
  return images;
}

function removeMissing(
  images: Map<number, Phaser.GameObjects.Image>,
  ids: readonly number[],
): void {
  if (images.size === 0) return;
  const live = new Set(ids);
  for (const [id, image] of images) {
    if (live.has(id)) continue;
    image.destroy();
    images.delete(id);
  }
}

/** The level's ammo boxes and coins; collected ones disappear when the server stops listing them. */
export class PickupViews {
  private readonly ammo: Map<number, Phaser.GameObjects.Image>;
  private readonly coins: Map<number, Phaser.GameObjects.Image>;

  constructor(scene: Phaser.Scene, level: LevelConfig, depth: number) {
    // Ammo boxes first, as in the original, so coins draw on top of them.
    this.ammo = createImages(scene, level.ammoPickups, TextureKey.ammoPickup, depth);
    this.coins = createImages(scene, level.coins, TextureKey.coin, depth);
  }

  sync(ammoPickupIds: readonly number[], coinIds: readonly number[]): void {
    removeMissing(this.ammo, ammoPickupIds);
    removeMissing(this.coins, coinIds);
  }
}
