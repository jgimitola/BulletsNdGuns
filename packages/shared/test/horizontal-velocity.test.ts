import { describe, expect, it } from 'vitest';
import { nextHorizontalVelocity } from '../src/simulation/horizontal-velocity.ts';
import { MOVEMENT } from '../src/simulation/movement-tuning.ts';

function run(vx: number, direction: -1 | 0 | 1, onFloor: boolean, ticks: number): number {
  let v = vx;
  for (let i = 0; i < ticks; i++) v = nextHorizontalVelocity(v, direction, onFloor);
  return v;
}

describe('nextHorizontalVelocity', () => {
  it('ground: reaches 270 in exactly 6 ticks', () => {
    expect(run(0, 1, true, 5)).toBeLessThan(270);
    expect(run(0, 1, true, 6)).toBe(270);
  });

  it('ground: stops in exactly 4 ticks', () => {
    expect(run(270, 0, true, 3)).toBeGreaterThan(0);
    expect(run(270, 0, true, 4)).toBe(0);
  });

  it('air: reaches 270 in 9 ticks, drifts to 0 in 15', () => {
    expect(run(0, 1, false, 8)).toBeLessThan(270);
    expect(run(0, 1, false, 9)).toBe(270);
    expect(run(270, 0, false, 14)).toBeGreaterThan(0);
    expect(run(270, 0, false, 15)).toBe(0);
  });

  it('ground reversal brakes at the decel rate', () => {
    expect(nextHorizontalVelocity(270, -1, true)).toBe(270 - 67.5);
  });

  it('air reversal brakes at the air accel rate', () => {
    expect(nextHorizontalVelocity(270, -1, false)).toBe(240);
  });

  it('reversal clamps at 0 for the tick that would cross it', () => {
    expect(nextHorizontalVelocity(30, -1, true)).toBe(0);
    expect(nextHorizontalVelocity(-30, 1, false)).toBe(0);
    expect(nextHorizontalVelocity(0, -1, true)).toBe(-45);
  });

  it('never overshoots', () => {
    expect(nextHorizontalVelocity(260, 1, true)).toBe(270);
    expect(nextHorizontalVelocity(-260, -1, true)).toBe(-270);
    expect(nextHorizontalVelocity(10, 0, true)).toBe(0);
  });

  it('tuning override', () => {
    const fast = { ...MOVEMENT, groundAccelTicks: 2 };
    let v = 0;
    v = nextHorizontalVelocity(v, 1, true, fast);
    expect(v).toBeLessThan(270);
    v = nextHorizontalVelocity(v, 1, true, fast);
    expect(v).toBe(270);
  });
});
