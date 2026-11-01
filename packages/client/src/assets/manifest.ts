import { LEVELS } from '@bng/shared';
import type Phaser from 'phaser';
import { localizedAsset } from '../i18n/index.ts';

export const TextureKey = {
  title: 'title',
  credits: 'credits',
  infoButton: 'info-button',
  howToPlayPopup: 'how-to-play-popup',
  menuBackground: 'menu-background',
  playButton: 'play-button',
  playButtonHover: 'play-button-hover',
  howToPlayButton: 'how-to-play-button',
  howToPlayButtonHover: 'how-to-play-button-hover',
  waiting: 'waiting',
  player: 'player',
  enemy: 'enemy',
  ammoPickup: 'ammo-pickup',
  bullet: 'bullet',
  coin: 'coin',
  portal: 'portal',
  levelTiles: 'level-tiles',
} as const;

export const SoundKey = {
  buttonHover: 'button-hover',
  shot: 'shot',
  jump: 'jump',
} as const;

export const ANIMATION_WAITING = 'waiting';

export const PLAYER_FRAME = { frameWidth: 27, frameHeight: 23 } as const;
export const WAITING_FRAME = { frameWidth: 291, frameHeight: 70 } as const;

export function loadAllAssets(load: Phaser.Loader.LoaderPlugin): void {
  load.audio(SoundKey.buttonHover, 'assets/sounds/button-hover.ogg');
  load.audio(SoundKey.shot, 'assets/sounds/shot.mp3');
  load.audio(SoundKey.jump, 'assets/sounds/jump.wav');

  load.image(TextureKey.title, localizedAsset('title.png'));
  load.image(TextureKey.credits, localizedAsset('credits.png'));
  load.image(TextureKey.howToPlayPopup, localizedAsset('how-to-play-popup.png'));
  load.image(TextureKey.playButton, localizedAsset('play-button.png'));
  load.image(TextureKey.playButtonHover, localizedAsset('play-button-hover.png'));
  load.image(TextureKey.howToPlayButton, localizedAsset('how-to-play-button.png'));
  load.image(TextureKey.howToPlayButtonHover, localizedAsset('how-to-play-button-hover.png'));
  load.spritesheet(TextureKey.waiting, localizedAsset('waiting.png'), WAITING_FRAME);

  load.image(TextureKey.infoButton, 'assets/textures/info-button.png');
  load.image(TextureKey.menuBackground, 'assets/textures/menu-background.png');
  load.spritesheet(TextureKey.player, 'assets/textures/player-spritesheet.png', PLAYER_FRAME);
  load.spritesheet(TextureKey.enemy, 'assets/textures/enemy-spritesheet.png', PLAYER_FRAME);
  load.image(TextureKey.ammoPickup, 'assets/textures/ammo-pickup.png');
  load.image(TextureKey.bullet, 'assets/textures/bullet.png');
  load.image(TextureKey.coin, 'assets/textures/coin.png');
  load.image(TextureKey.portal, 'assets/textures/portal.png');
  load.image(TextureKey.levelTiles, 'assets/textures/level-tiles.png');

  // Tilemaps come from the shared package (the server reads the same data); Phaser accepts a parsed object as the url.
  for (const level of LEVELS) {
    load.tilemapTiledJSON(level.tilemapKey, level.map);
  }
}
