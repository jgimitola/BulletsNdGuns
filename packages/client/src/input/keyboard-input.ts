import Phaser from 'phaser';
import type { InputKeys } from '@bng/shared';
import { PressLatch } from './press-latch.ts';

type ControlKey = 'W' | 'A' | 'D' | 'UP' | 'LEFT' | 'RIGHT' | 'SPACE';

/**
 * The controls: W or UP jumps, A/D or LEFT/RIGHT run, SPACE or the left mouse button shoots.
 */
export class KeyboardInput {
  private readonly keys: Record<ControlKey, Phaser.Input.Keyboard.Key>;
  private readonly jump = new PressLatch();
  private readonly shoot = new PressLatch();

  constructor(scene: Phaser.Scene) {
    const keyboard = scene.input.keyboard;
    if (!keyboard) throw new Error('Keyboard input is not available');
    const { KeyCodes } = Phaser.Input.Keyboard;
    const codes = {
      W: KeyCodes.W,
      A: KeyCodes.A,
      D: KeyCodes.D,
      UP: KeyCodes.UP,
      LEFT: KeyCodes.LEFT,
      RIGHT: KeyCodes.RIGHT,
      SPACE: KeyCodes.SPACE,
    };
    // addKeys also captures them (preventDefault on window). The scene's KeyboardPlugin removes the
    // keys itself when the scene shuts down but leaves the capture in the game-wide KeyboardManager,
    // which would keep these keys out of the HTML text fields after a match. Release it here.
    this.keys = keyboard.addKeys(codes) as Record<ControlKey, Phaser.Input.Keyboard.Key>;
    // The down event fires once per physical press (key repeat is off), so it is the press edge;
    // polling isDown per tick would miss a tap shorter than a tick.
    const onJump = () => this.jump.press();
    const onShoot = () => this.shoot.press();
    // A left click on the canvas shoots too, unless it lands on an interactive game object such as
    // the debug panel's title. Clicks on the HTML overlay's buttons never reach the canvas.
    const onPointerDown = (
      pointer: Phaser.Input.Pointer,
      over: Phaser.GameObjects.GameObject[],
    ) => {
      if (pointer.leftButtonDown() && over.length === 0) this.shoot.press();
    };
    const { DOWN } = Phaser.Input.Keyboard.Events;
    const { POINTER_DOWN } = Phaser.Input.Events;
    this.keys.W.on(DOWN, onJump);
    this.keys.UP.on(DOWN, onJump);
    this.keys.SPACE.on(DOWN, onShoot);
    scene.input.on(POINTER_DOWN, onPointerDown);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.keys.W.off(DOWN, onJump);
      this.keys.UP.off(DOWN, onJump);
      this.keys.SPACE.off(DOWN, onShoot);
      scene.input.off(POINTER_DOWN, onPointerDown);
      keyboard.removeCapture(Object.values(codes));
    });
  }

  read(): InputKeys {
    return {
      left: this.keys.A.isDown || this.keys.LEFT.isDown,
      right: this.keys.D.isDown || this.keys.RIGHT.isDown,
      jumpPressed: this.jump.take(),
      shootPressed: this.shoot.take(),
    };
  }
}
