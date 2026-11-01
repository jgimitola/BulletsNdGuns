import Phaser from 'phaser';
import { GameOverScene } from './scenes/game-over-scene.ts';
import { LevelScene } from './scenes/level-scene.ts';
import { LoaderScene } from './scenes/loader-scene.ts';
import { MenuScene } from './scenes/menu-scene.ts';

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: 'game',
  scale: {
    mode: Phaser.Scale.NONE,
    autoCenter: Phaser.Scale.CENTER_HORIZONTALLY,
  },
  audio: { disableWebAudio: true },
  pixelArt: true,
  scene: [LoaderScene, MenuScene, LevelScene, GameOverScene],
};
