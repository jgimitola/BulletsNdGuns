/**
 * Every movement-feel number in one place, authored in units a designer
 * thinks in (ticks, pixels, px/s). Derived per-tick rates are computed from
 * these where they are used, never stored here.
 */
export const MOVEMENT = Object.freeze({
  /** Top horizontal speed, px/s. */
  runSpeed: 270,
  /** Ticks from 0 to full speed on the ground. */
  groundAccelTicks: 6,
  /** Ticks from full speed to 0 on the ground; also the braking rate when reversing. */
  groundDecelTicks: 4,
  /** Ticks from 0 to full speed in the air. */
  airAccelTicks: 9,
  /**
   * Ticks from full speed to 0 in the air with no direction held (drift).
   * Reversing in the air brakes at the airAccelTicks rate so a mid-jump turn is not slippery.
   */
  airDecelTicks: 15,
  /** Ticks a jump press is remembered before landing (~100 ms). */
  jumpBufferTicks: 6,
  /** Ticks a jump still works after leaving the ground (~100 ms). */
  coyoteTicks: 6,
  /** Max horizontal px to slide sideways when rising and the head clips a block, instead of stopping. */
  headNudgeMaxPx: 12,
  /** Max px a block top may sit above the feet to be stepped onto when moving into it, not rising. */
  ledgeCatchMaxPx: 8,
  /** Ticks the shoot pose shows after a bullet fires (~200 ms). */
  shotPoseTicks: 12,
});

/** Shape of the tuning object, with plain number fields so tests and tools can override values. */
export type MovementTuning = { readonly [K in keyof typeof MOVEMENT]: number };
