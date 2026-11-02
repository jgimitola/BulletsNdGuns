import { MOVEMENT, type MovementTuning } from './movement-tuning.ts';

/** Held horizontal input: -1 left, 0 none, 1 right. */
export type Direction = -1 | 0 | 1;

/**
 * Next horizontal velocity (px/s) after one tick of momentum.
 *
 * Reversing brakes at the ground decel rate on the floor and the air accel
 * rate in the air. A braking tick that would cross 0 clamps at 0 instead of
 * carrying into the new direction: it keeps the function a simple move toward
 * one target per tick, and the next tick accelerates from rest. Never
 * overshoots the target.
 */
export function nextHorizontalVelocity(
  vx: number,
  direction: Direction,
  onFloor: boolean,
  tuning: MovementTuning = MOVEMENT,
): number {
  const accelTicks = onFloor ? tuning.groundAccelTicks : tuning.airAccelTicks;
  const decelTicks = onFloor ? tuning.groundDecelTicks : tuning.airDecelTicks;
  const reversing = direction !== 0 && vx * direction < 0;

  let ticks = accelTicks;
  if (direction === 0) ticks = decelTicks;
  else if (reversing) ticks = onFloor ? tuning.groundDecelTicks : tuning.airAccelTicks;

  const target = direction * tuning.runSpeed;
  const step = tuning.runSpeed / ticks;
  // Braking aims at 0, not at the far target, so the clamp lands on rest.
  const goal = reversing ? 0 : target;
  if (vx < goal) return Math.min(vx + step, goal);
  return Math.max(vx - step, goal);
}
