import Phaser from 'phaser';
import { registerAnimations } from '../assets/animations.ts';
import { loadAllAssets } from '../assets/manifest.ts';
import { t } from '../i18n/index.ts';

export class LoaderScene extends Phaser.Scene {
  constructor() {
    super('loader');
  }

  preload(): void {
    const progressBar = this.add.graphics();
    const progressBox = this.add.graphics();
    progressBox.fillStyle(0x222222, 0.8);
    progressBox.fillRect(240, 270, 320, 50);

    const width = this.cameras.main.width;
    const height = this.cameras.main.height;
    const makeText = (y: number, size: number, text: string) =>
      this.make
        .text({ x: width / 2, y, text, style: { font: `${size}px monospace`, color: '#ffffff' } })
        .setOrigin(0.5, 0.5);

    const loadingText = makeText(height / 2 - 50, 20, t('loader.loading'));
    const percentText = makeText(height / 2 - 5, 18, '0%');
    const assetText = makeText(height / 2 + 50, 18, '');

    this.load.on('progress', (value: number) => {
      percentText.setText(`${Math.trunc(value * 100)}%`);
      progressBar.clear();
      progressBar.fillStyle(0xffffff, 1);
      progressBar.fillRect(250, 280, 300 * value, 30);
    });
    this.load.on('fileprogress', (file: Phaser.Loader.File) => {
      assetText.setText(t('loader.asset', { key: file.key }));
    });
    this.load.on('complete', () => {
      progressBar.destroy();
      progressBox.destroy();
      loadingText.destroy();
      percentText.destroy();
      assetText.destroy();
    });

    loadAllAssets(this.load);
  }

  create(): void {
    registerAnimations(this.anims);
    this.scene.start('menu');
  }
}
