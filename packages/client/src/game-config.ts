import Phaser from 'phaser';
import { EditorScene } from './scenes/editor-scene.ts';
import { LevelScene } from './scenes/level-scene.ts';
import { LoaderScene } from './scenes/loader-scene.ts';
import { MenuScene } from './scenes/menu-scene.ts';

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: 'game',
  // The world stays 800x600; the canvas is scaled to fit #stage, which CSS keeps at 4:3.
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  audio: { disableWebAudio: true },
  pixelArt: true,
  scene: [LoaderScene, MenuScene, LevelScene, EditorScene],
};
