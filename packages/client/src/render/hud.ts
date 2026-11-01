import type Phaser from 'phaser';
import { t } from '../i18n/index.ts';

/** Ammo and coin counters in the top-left corner, in Phaser's default text style. */
export class Hud {
  private readonly ammoText: Phaser.GameObjects.Text;
  private readonly coinsText: Phaser.GameObjects.Text;
  private ammo: number;
  private coins: number;

  constructor(scene: Phaser.Scene, ammo: number, coins: number, depth: number) {
    this.ammo = ammo;
    this.coins = coins;
    this.ammoText = scene.add.text(2, 0, t('hud.ammo', { count: ammo })).setDepth(depth);
    this.coinsText = scene.add.text(2, 12, t('hud.coins', { count: coins })).setDepth(depth);
  }

  update(ammo: number, coins: number): void {
    if (ammo !== this.ammo) {
      this.ammo = ammo;
      this.ammoText.setText(t('hud.ammo', { count: ammo }));
    }
    if (coins !== this.coins) {
      this.coins = coins;
      this.coinsText.setText(t('hud.coins', { count: coins }));
    }
  }
}
