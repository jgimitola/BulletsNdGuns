import Phaser from 'phaser';
import { registerAnimations } from '../assets/animations.ts';
import { loadAllAssets } from '../assets/manifest.ts';
import { getServices } from '../services.ts';

/** Loads every asset; the HTML loading screen shows the progress it reports. */
export class LoaderScene extends Phaser.Scene {
  constructor() {
    super('loader');
  }

  preload(): void {
    const { ui } = getServices(this);
    ui.getState().setScreen('loading');
    this.load.on('progress', (value: number) => {
      ui.getState().setLoading(value, ui.getState().loading.file);
    });
    this.load.on('fileprogress', (file: Phaser.Loader.File) => {
      ui.getState().setLoading(ui.getState().loading.progress, file.key);
    });
    loadAllAssets(this.load);
  }

  create(): void {
    registerAnimations(this.anims);
    this.scene.start('menu');
  }
}
