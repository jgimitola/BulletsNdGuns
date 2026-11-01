import Phaser from 'phaser';
import { registerAnimations } from '../assets/animations.ts';
import { loadAllAssets } from '../assets/manifest.ts';
import { NICKNAME_FONT } from '../render/player-view.ts';
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
    const { ui } = getServices(this);
    // Canvas text drawn before its web font loads keeps the fallback font for good.
    const fontReady = document.fonts.load(NICKNAME_FONT).catch(() => []);
    void fontReady.then(() => {
      ui.getState().setScreen('menu');
      this.scene.start('menu');
    });
  }
}
