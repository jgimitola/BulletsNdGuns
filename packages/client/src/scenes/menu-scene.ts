import Phaser from 'phaser';
import type { LevelStarted } from '@bng/shared';
import { getServices } from '../services.ts';

/**
 * Draws nothing: the HTML menu, room list, lobby and result screens cover it. It only waits for the
 * server to start the first level of a match. It does not touch the UI screen, so starting it after
 * a match leaves the result on show.
 */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu');
  }

  create(): void {
    const { network } = getServices(this);
    const unsubscribe = network.on('levelStarted', (payload: LevelStarted) => {
      this.scene.start('level', payload);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);
  }
}
