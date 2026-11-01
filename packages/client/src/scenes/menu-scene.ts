import Phaser from 'phaser';
import { ANIMATION_WAITING, SoundKey, TextureKey } from '../assets/manifest.ts';
import { getServices } from '../services.ts';

const PLAY_Y = 272;
const HOW_TO_PLAY_Y = 357;

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu');
  }

  create(): void {
    const { network } = getServices(this);
    const hoverSound = this.sound.add(SoundKey.buttonHover, { volume: 0.2, loop: false });

    // Creation order decides depth and which object receives a click, so it mirrors the original menu.
    // Hidden objects use setVisible(false): Phaser's InputManager.inputCandidate skips anything that
    // will not render, so they receive no pointer events.
    this.add.image(400, 300, TextureKey.menuBackground);
    this.add.image(400, 192, TextureKey.title);

    const playButton = this.add.image(400, PLAY_Y, TextureKey.playButton);
    const playButtonHover = this.add.image(400, PLAY_Y, TextureKey.playButtonHover).setVisible(false);
    const infoButton = this.add.image(785, 15, TextureKey.infoButton);
    const credits = this.add.image(400, 300, TextureKey.credits).setVisible(false);
    const waiting = this.add.sprite(400, PLAY_Y, TextureKey.waiting).setVisible(false);

    const howToPlayButton = this.add.image(400, HOW_TO_PLAY_Y, TextureKey.howToPlayButton);
    const howToPlayButtonHover = this.add
      .image(400, HOW_TO_PLAY_Y, TextureKey.howToPlayButtonHover)
      .setVisible(false);
    const popup = this.add.image(400, 280, TextureKey.howToPlayPopup).setVisible(false);

    credits.setInteractive();
    credits.on('pointerdown', () => {
      credits.setVisible(false);
      playButton.setVisible(true);
      howToPlayButton.setVisible(true);
    });
    infoButton.setInteractive();
    infoButton.on('pointerdown', () => {
      playButton.setVisible(false);
      howToPlayButton.setVisible(false);
      credits.setVisible(true);
    });

    // Once play is clicked the hover image must not revert to the normal one.
    let clicked = false;
    playButton.setInteractive();
    playButtonHover.setInteractive();
    playButton.on('pointerover', () => {
      playButtonHover.setVisible(true);
      playButton.setVisible(false);
      hoverSound.play();
    });
    playButtonHover.on('pointerout', () => {
      if (!clicked) {
        playButtonHover.setVisible(false);
        playButton.setVisible(true);
      }
    });
    playButtonHover.on('pointerdown', () => {
      clicked = true;
      playButton.setVisible(false);
      playButtonHover.setVisible(false);
      waiting.setVisible(true);
      waiting.play(ANIMATION_WAITING);
      network.sendReady();
    });

    popup.setInteractive();
    howToPlayButton.setInteractive();
    howToPlayButtonHover.setInteractive();
    howToPlayButton.on('pointerover', () => {
      howToPlayButtonHover.setVisible(true);
      howToPlayButton.setVisible(false);
      hoverSound.play();
    });
    howToPlayButtonHover.on('pointerout', () => {
      howToPlayButton.setVisible(true);
      howToPlayButtonHover.setVisible(false);
    });
    howToPlayButtonHover.on('pointerdown', () => {
      popup.setVisible(true);
    });
    popup.on('pointerdown', () => {
      popup.setVisible(false);
    });

    const unsubscribe = network.on('levelStarted', (payload) => {
      this.scene.start('level', payload);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);
  }
}
