import { expect, test } from 'vitest';
import type { Rect } from '../src/geometry.ts';
import { getLevel } from '../src/levels/level-registry.ts';
import { NEUTRAL_INPUT, type InputFrame } from '../src/protocol/input.ts';
import {
  bodyBox,
  createPlayer,
  nextNarrow,
  stepPlayer,
  type PlayerState,
  type PlayerStepResult,
} from '../src/simulation/player.ts';

const L1 = getLevel(0);
const L3 = getLevel(2);

let seq = 0;
function input(keys: Partial<Omit<InputFrame, 'seq'>> = {}): InputFrame {
  return { ...NEUTRAL_INPUT, ...keys, seq: ++seq };
}

function settle(p: PlayerState): PlayerState {
  return stepPlayer(p, input(), L1).player;
}

function rect(x: number, y: number, width: number, height: number): Rect {
  return {
    x: expect.closeTo(x, 6),
    y: expect.closeTo(y, 6),
    width: expect.closeTo(width, 6),
    height: expect.closeTo(height, 6),
  } as Rect;
}

/** Runs `ticks` steps with the same keys held, returning every step result. */
function run(
  p: PlayerState,
  ticks: number,
  keys: Partial<Omit<InputFrame, 'seq'>>,
): PlayerStepResult[] {
  const results: PlayerStepResult[] = [];
  let current = p;
  for (let i = 0; i < ticks; i++) {
    const r = stepPlayer(current, input(keys), L1);
    results.push(r);
    current = r.player;
  }
  return results;
}

test('createPlayer starts at the side spawn facing the centre', () => {
  const a = createPlayer('a', 'left', L1);
  expect(a).toEqual({
    id: 'a',
    side: 'left',
    x: 13,
    y: 514,
    vx: 0,
    vy: 0,
    facing: 'right',
    narrow: false,
    onFloor: false,
    ammo: 2,
    score: 0,
    ticksSinceShot: 1_000_000,
    anim: 'idle',
  });
  const b = createPlayer('b', 'right', L1, 7);
  expect([b.x, b.y, b.facing, b.score]).toEqual([803, 514, 'left', 7]);
});

test('left spawn settles on floor and inside bounds', () => {
  const p = settle(createPlayer('a', 'left', L1));
  expect(p.x).toBeCloseTo(26.45, 6);
  expect(p.y).toBeCloseTo(513.55, 6);
  expect(p.onFloor).toBe(true);
  expect(Object.is(p.vx, 0)).toBe(true);
  expect(Object.is(p.vy, 0)).toBe(true);
});

test('right spawn settles against right bound', () => {
  const p = settle(createPlayer('b', 'right', L1));
  expect(p.x).toBeCloseTo(775.85, 6);
  expect(p.y).toBeCloseTo(513.55, 6);
  expect(p.facing).toBe('left');
});

test('runs 4.5 px per tick', () => {
  const start = settle(createPlayer('a', 'left', L1));
  const results = run(start, 10, { right: true });
  const last = results.at(-1)!.player;
  expect(last.x).toBeCloseTo(71.45, 6);
  expect(last.y).toBeCloseTo(513.55, 6);
  expect(last.facing).toBe('right');
  expect(last.vx).toBe(270);
  expect(results[0]!.player.x).toBeCloseTo(30.95, 6);
  expect(results[0]!.player.anim).toBe('idle');
  for (const r of results.slice(1)) expect(r.player.anim).toBe('run');
});

test('jump apex is 87.5 px above floor', () => {
  const start = settle(createPlayer('a', 'left', L1));
  const results = [stepPlayer(start, input({ jump: true }), L1)];
  while (!results.at(-1)!.player.onFloor) {
    expect(results.length).toBeLessThan(200);
    results.push(stepPlayer(results.at(-1)!.player, input(), L1));
  }
  const minY = Math.min(...results.map((r) => r.player.y));
  expect(minY).toBeCloseTo(426.05, 6);
  expect(results[0]!.jumped).toBe(true);
  expect(results.slice(1).every((r) => !r.jumped)).toBe(true);
  expect(results.at(-1)!.player.y).toBeCloseTo(513.55, 6);
  // Animation is chosen before movement: on the jump tick the player was still on the floor.
  expect(results[0]!.player.anim).toBe('idle');
  expect(results[1]!.player.anim).toBe('jump');
  expect(results.at(-1)!.player.anim).toBe('fall');
});

test('holding jump re-jumps on landing', () => {
  const start = settle(createPlayer('a', 'left', L1));
  const results = run(start, 120, { jump: true });
  expect(results[0]!.jumped).toBe(true);
  const landed = results.findIndex((r, i) => i > 0 && r.player.onFloor);
  expect(landed).toBeGreaterThan(0);
  expect(results.slice(1, landed + 1).every((r) => !r.jumped)).toBe(true);
  expect(results[landed + 1]!.jumped).toBe(true);
});

test('cooldown: shots on tick 1 and tick 62 only, ammo 2 → 0', () => {
  const start = settle(createPlayer('a', 'left', L1));
  const firstSeq = seq + 1;
  const results = run(start, 70, { shoot: true });
  const shotTicks = results.flatMap((r, i) => (r.bullet ? [i + 1] : []));
  expect(shotTicks).toEqual([1, 62]);
  expect(results[0]!.bullet).toEqual({
    id: `a:${firstSeq}`,
    ownerId: 'a',
    x: expect.closeTo(26.45, 6),
    y: expect.closeTo(518.55, 6),
    vx: 600,
  });
  expect(results[61]!.bullet!.id).toBe(`a:${firstSeq + 61}`);
  expect(results[0]!.player.ammo).toBe(1);
  expect(results[0]!.player.ticksSinceShot).toBe(0);
  expect(results[60]!.player.ammo).toBe(1);
  expect(results.at(-1)!.player.ammo).toBe(0);
  expect(results[0]!.player.anim).toBe('shoot');
});

test('no bullet with zero ammo but anim is not shoot', () => {
  const start = { ...settle(createPlayer('a', 'left', L1)), ammo: 0 };
  const r = stepPlayer(start, input({ shoot: true }), L1);
  expect(r.bullet).toBeNull();
  expect(r.player.anim).toBe('idle');
  expect(r.player.ammo).toBe(0);
});

test('facing left fires negative velocity', () => {
  const start = settle(createPlayer('b', 'right', L1));
  const r = stepPlayer(start, input({ shoot: true }), L1);
  expect(r.bullet).not.toBeNull();
  expect(r.bullet!.vx).toBe(-600);
  expect(r.bullet!.ownerId).toBe('b');
  expect(r.bullet!.x).toBeCloseTo(775.85, 6);
});

test('bullet uses facing from before this tick turns the player', () => {
  const start = settle(createPlayer('a', 'left', L1));
  const r = stepPlayer(start, input({ shoot: true, left: true }), L1);
  expect(r.bullet!.vx).toBe(600);
  expect(r.player.facing).toBe('left');
});

test('bodyBox normal and narrow', () => {
  expect(bodyBox({ x: 100, y: 100, facing: 'right', narrow: false })).toEqual(
    rect(73.55, 91.95, 27.6, 34.5),
  );
  expect(bodyBox({ x: 100, y: 100, facing: 'left', narrow: false })).toEqual(
    rect(96.55, 91.95, 27.6, 34.5),
  );
  expect(bodyBox({ x: 100, y: 100, facing: 'right', narrow: true })).toEqual(
    rect(82.75, 91.95, 6.9, 34.5),
  );
  expect(bodyBox({ x: 100, y: 100, facing: 'left', narrow: true })).toEqual(
    rect(110.35, 91.95, 6.9, 34.5),
  );
  expect(bodyBox({ x: 100, y: 100, facing: 'left', narrow: true }).x).toBeCloseTo(110.35, 6);
});

test('narrow is sticky when leaving zone facing left', () => {
  const base = createPlayer('a', 'left', L1);
  const zone = L1.parkourZone;
  expect(nextNarrow({ ...base, x: 300, y: 60, facing: 'left', narrow: false }, zone)).toBe(true);
  expect(nextNarrow({ ...base, x: 300, y: 60, facing: 'right', narrow: false }, zone)).toBe(true);
  expect(nextNarrow({ ...base, x: 100, y: 500, facing: 'left', narrow: true }, zone)).toBe(true);
  expect(nextNarrow({ ...base, x: 100, y: 500, facing: 'left', narrow: false }, zone)).toBe(false);
  expect(nextNarrow({ ...base, x: 100, y: 500, facing: 'right', narrow: true }, zone)).toBe(false);
  expect(
    nextNarrow({ ...base, x: 100, y: 500, facing: 'right', narrow: true }, L3.parkourZone),
  ).toBe(false);
  // Zone bounds are strict.
  expect(nextNarrow({ ...base, x: 256, y: 60, facing: 'right', narrow: false }, zone)).toBe(false);
  expect(nextNarrow({ ...base, x: 300, y: 90, facing: 'right', narrow: false }, zone)).toBe(false);
});

test('stepPlayer applies narrow before moving', () => {
  const p = { ...createPlayer('a', 'left', L1), x: 300, y: 60 };
  expect(stepPlayer(p, input(), L1).player.narrow).toBe(true);
});

test('stepPlayer is pure and deterministic', () => {
  const p = createPlayer('a', 'left', L1);
  const snapshot = { ...p }; // PlayerState is flat, so a spread is a full copy
  const frame = input({ right: true, jump: true, shoot: true });
  const a = stepPlayer(p, frame, L1);
  const b = stepPlayer(p, frame, L1);
  expect(p).toEqual(snapshot);
  expect(a).toEqual(b);
  expect(a.player).not.toBe(p);
});
