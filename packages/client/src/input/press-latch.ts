/**
 * Turns key-down events into per-tick presses. Render frames run 0..5 fixed ticks, so a press can
 * arrive between ticks; the latch holds it until a tick consumes it, and a double tap before that
 * tick still counts once because a tick can only use one press.
 */
export class PressLatch {
  private pressed = false;

  /** Records that the key went down. */
  press(): void {
    this.pressed = true;
  }

  /** True once per press, then false until the next press. */
  take(): boolean {
    const was = this.pressed;
    this.pressed = false;
    return was;
  }
}
