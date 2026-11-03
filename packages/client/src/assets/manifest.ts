import { PLAYER_FRAME_HEIGHT, PLAYER_FRAME_WIDTH } from '@bng/shared';
import type Phaser from 'phaser';

export const TextureKey = {
  player: 'player',
  enemy: 'enemy',
  ammoPickup: 'ammo-pickup',
  bullet: 'bullet',
  coin: 'coin',
  portal: 'portal',
  levelTiles: 'level-tiles',
} as const;

export const SoundKey = {
  shot: 'shot',
  jump: 'jump',
} as const;

export const PLAYER_FRAME = {
  frameWidth: PLAYER_FRAME_WIDTH,
  frameHeight: PLAYER_FRAME_HEIGHT,
} as const;

export function loadAllAssets(load: Phaser.Loader.LoaderPlugin): void {
  load.audio(SoundKey.shot, 'assets/sounds/shot.mp3');
  load.audio(SoundKey.jump, 'assets/sounds/jump.wav');

  load.spritesheet(TextureKey.player, 'assets/textures/player-spritesheet.png', PLAYER_FRAME);
  load.spritesheet(TextureKey.enemy, 'assets/textures/enemy-spritesheet.png', PLAYER_FRAME);
  load.image(TextureKey.ammoPickup, 'assets/textures/ammo-pickup.png');
  load.image(TextureKey.bullet, 'assets/textures/bullet.png');
  load.image(TextureKey.coin, 'assets/textures/coin.png');
  load.image(TextureKey.portal, 'assets/textures/portal.png');
  load.image(TextureKey.levelTiles, 'assets/textures/level-tiles.png');
}
