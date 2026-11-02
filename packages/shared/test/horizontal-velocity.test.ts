import { describe, expect, it } from 'vitest';
import { nextHorizontalVelocity } from '../src/simulation/horizontal-velocity.ts';
import { MOVEMENT } from '../src/simulation/movement-tuning.ts';

function run(vx: number, direction: -1 | 0 | 1, onFloor: boolean, ticks: number): number {
  let v = vx;
  for (let i = 0; i < ticks; i++) v = nextHorizontalVelocity(v, direction, onFloor);
  return v;
}

const { runSpeed, groundAccelTicks, groundDecelTicks, airAccelTicks, airDecelTicks } = MOVEMENT;
const groundAccel = runSpeed / groundAccelTicks;
const groundDecel = runSpeed / groundDecelTicks;
const airAccel = runSpeed / airAccelTicks;

describe('nextHorizontalVelocity', () => {
  it('ground: reaches run speed in exactly groundAccelTicks', () => {
    expect(run(0, 1, true, groundAccelTicks - 1)).toBeLessThan(runSpeed);
    expect(run(0, 1, true, groundAccelTicks)).toBe(runSpeed);
  });

  it('ground: stops in exactly groundDecelTicks', () => {
    expect(run(runSpeed, 0, true, groundDecelTicks - 1)).toBeGreaterThan(0);
    expect(run(runSpeed, 0, true, groundDecelTicks)).toBe(0);
  });

  it('air: reaches run speed in airAccelTicks, drifts to 0 in airDecelTicks', () => {
    expect(run(0, 1, false, airAccelTicks - 1)).toBeLessThan(runSpeed);
    expect(run(0, 1, false, airAccelTicks)).toBe(runSpeed);
    expect(run(runSpeed, 0, false, airDecelTicks - 1)).toBeGreaterThan(0);
    expect(run(runSpeed, 0, false, airDecelTicks)).toBe(0);
  });

  it('ground reversal brakes at the decel rate', () => {
    expect(nextHorizontalVelocity(runSpeed, -1, true)).toBeCloseTo(runSpeed - groundDecel, 9);
  });

  it('air reversal brakes at the air accel rate', () => {
    expect(nextHorizontalVelocity(runSpeed, -1, false)).toBeCloseTo(runSpeed - airAccel, 9);
  });

  it('reversal clamps at 0 for the tick that would cross it', () => {
    expect(nextHorizontalVelocity(groundDecel / 2, -1, true)).toBe(0);
    expect(nextHorizontalVelocity(-airAccel / 2, 1, false)).toBe(0);
    expect(nextHorizontalVelocity(0, -1, true)).toBeCloseTo(-groundAccel, 9);
  });

  it('never overshoots', () => {
    expect(nextHorizontalVelocity(runSpeed - groundAccel / 2, 1, true)).toBe(runSpeed);
    expect(nextHorizontalVelocity(-(runSpeed - groundAccel / 2), -1, true)).toBe(-runSpeed);
    expect(nextHorizontalVelocity(groundDecel / 2, 0, true)).toBe(0);
  });

  it('tuning override', () => {
    const fast = { ...MOVEMENT, groundAccelTicks: 2 };
    let v = 0;
    v = nextHorizontalVelocity(v, 1, true, fast);
    expect(v).toBeLessThan(runSpeed);
    v = nextHorizontalVelocity(v, 1, true, fast);
    expect(v).toBe(runSpeed);
  });
});
