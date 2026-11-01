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
    // The scene's KeyboardPlugin removes these keys itself when the scene shuts down.
    // addKeys also captures them (preventDefault on window). The shutdown above leaves that capture
    // in the game-wide KeyboardManager, so from the first level on, for the life of the page, an
    // HTML text input would not receive W/A/D/SPACE: call keyboard.removeCapture or
    // disableGlobalCapture when such an input arrives.
    this.keys = keyboard.addKeys({
      W: KeyCodes.W,
      A: KeyCodes.A,
      D: KeyCodes.D,
      SPACE: KeyCodes.SPACE,
    }) as Record<ControlKey, Phaser.Input.Keyboard.Key>;
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
