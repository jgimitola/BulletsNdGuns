import Phaser from 'phaser';
import type { InputKeys } from '@bng/shared';

type ControlKey = 'W' | 'A' | 'D' | 'SPACE';

/** The original controls: W jumps, A/D run, SPACE shoots. */
export class KeyboardInput {
  private readonly keys: Record<ControlKey, Phaser.Input.Keyboard.Key>;

  constructor(scene: Phaser.Scene) {
    const keyboard = scene.input.keyboard;
    if (!keyboard) throw new Error('Keyboard input is not available');
    const { KeyCodes } = Phaser.Input.Keyboard;
    const codes = { W: KeyCodes.W, A: KeyCodes.A, D: KeyCodes.D, SPACE: KeyCodes.SPACE };
    // addKeys also captures them (preventDefault on window). The scene's KeyboardPlugin removes the
    // keys itself when the scene shuts down but leaves the capture in the game-wide KeyboardManager,
    // which would keep W/A/D/SPACE out of the HTML text fields after a match. Release it here.
    this.keys = keyboard.addKeys(codes) as Record<ControlKey, Phaser.Input.Keyboard.Key>;
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      keyboard.removeCapture(Object.values(codes));
    });
  }

  read(): InputKeys {
    return {
      left: this.keys.A.isDown,
      right: this.keys.D.isDown,
      jump: this.keys.W.isDown,
      shoot: this.keys.SPACE.isDown,
    };
  }
}
