import Phaser from 'phaser';
import type { LevelStarted } from '@bng/shared';
import { getServices } from '../services.ts';

/**
 * Draws nothing: the HTML menu, room list, lobby and result screens cover it. It only waits for the
 * server to start the first level of a match, or for an editing session to open. It does not
 * touch the UI screen, so starting it after a match leaves the result on show.
 */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu');
  }

  create(): void {
    const { network, ui } = getServices(this);
    const unsubscribe = network.on('levelStarted', (payload: LevelStarted) => {
      this.scene.start('level', payload);
    });
    // My levels opened an editing session: the editor scene draws it.
    const startEditor = () => {
      const { editor, screen } = ui.getState();
      if (editor !== null && screen === 'editor') this.scene.start('editor');
    };
    const unsubscribeUi = ui.subscribe(startEditor);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unsubscribe();
      unsubscribeUi();
    });
    startEditor();
  }
}
