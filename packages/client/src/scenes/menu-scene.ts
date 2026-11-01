import Phaser from 'phaser';
import { getServices } from '../services.ts';

/** Draws nothing: the HTML menu covers it. It only waits for the server to start the first level. */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu');
  }

  create(): void {
    const { network, ui } = getServices(this);
    ui.getState().setScreen('menu');
    const unsubscribe = network.on('levelStarted', (payload) => {
      this.scene.start('level', payload);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);
  }
}
