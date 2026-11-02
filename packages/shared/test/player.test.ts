import { expect, test } from 'vitest';
import type { Rect } from '../src/geometry.ts';
import { getLevel } from '../src/levels/level-registry.ts';
import { NEUTRAL_INPUT, type InputFrame, type InputKeys } from '../src/protocol/input.ts';
import { MOVEMENT } from '../src/simulation/movement-tuning.ts';
import { bodyBox, hitboxCentreFromSprite, spriteCentre } from '../src/simulation/player-body.ts';
import {
  createPlayer,
  respawn,
  stepPlayer,
  type Facing,
  type PlayerState,
  type PlayerStepResult,
} from '../src/simulation/player.ts';

const L1 = getLevel(0);
const DT = 1 / 60;
/** Level 1's floor (row 18) top edge. */
const FLOOR_TOP = 540;
/** Centre y of a hitbox (34.5 tall) resting on the level 1 floor. */
const FLOOR_Y = FLOOR_TOP - 34.5 / 2;
/** Centre x of a hitbox (27.6 wide) flush against the left world bound. */
const LEFT_WALL_X = 27.6 / 2;
/** Centre x of a hitbox flush against the right world bound (800). */
const RIGHT_WALL_X = 800 - 27.6 / 2;

let seq = 0;
function input(keys: Partial<InputKeys> = {}): InputFrame {
  return { ...NEUTRAL_INPUT, ...keys, seq: ++seq, level: 0 };
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
function run(p: PlayerState, ticks: number, keys: Partial<InputKeys>): PlayerStepResult[] {
  const results: PlayerStepResult[] = [];
  let current = p;
  for (let i = 0; i < ticks; i++) {
    const r = stepPlayer(current, input(keys), L1);
    results.push(r);
    current = r.player;
  }
  return results;
}

/** A player standing still at hitbox centre (x, y), after one settling tick. */
function standingAt(x: number, y: number, facing: Facing): PlayerState {
  return settle({ ...createPlayer('a', 'left', L1), x, y, facing });
}

test('createPlayer starts at the converted side spawn facing the centre', () => {
  const a = createPlayer('a', 'left', L1);
  expect(a).toEqual({
    id: 'a',
    side: 'left',
    // Level 1 left spawn (13, 514) is a sprite centre; the hitbox centre sits (-5.5, +4) source px away.
    x: expect.closeTo(13 - 5.5 * 2.3, 6),
    y: expect.closeTo(514 + 4 * 2.3, 6),
    vx: 0,
    vy: 0,
    facing: 'right',
    onFloor: false,
    ammo: 2,
    score: 0,
    ticksSinceShot: 1_000_000,
    jumpBufferTicks: 0,
    coyoteTicks: 0,
    shotPoseTicks: 0,
    anim: 'idle',
  });
  const b = createPlayer('b', 'right', L1, 7);
  expect([b.facing, b.score]).toEqual(['left', 7]);
  // Facing left the art is mirrored, so the horizontal offset flips sign.
  expect(b.x).toBeCloseTo(803 + 5.5 * 2.3, 6);
});

test('createPlayer: sprite draws at the original spawn', () => {
  const s = spriteCentre(createPlayer('a', 'left', L1), 'right');
  expect(s).toEqual({ x: expect.closeTo(13), y: expect.closeTo(514) });
  expect(spriteCentre(createPlayer('b', 'right', L1), 'left')).toEqual({
    x: expect.closeTo(803),
    y: expect.closeTo(514),
  });
});

test('hitboxCentreFromSprite inverts spriteCentre for both facings', () => {
  for (const facing of ['left', 'right'] as const) {
    const c = hitboxCentreFromSprite(spriteCentre({ x: 100, y: 200 }, facing), facing);
    expect(c).toEqual({ x: expect.closeTo(100, 9), y: expect.closeTo(200, 9) });
  }
});

test('bodyBox is centred and ignores facing', () => {
  expect(bodyBox({ x: 100, y: 100 })).toEqual(rect(100 - 13.8, 100 - 17.25, 27.6, 34.5));
  const p = createPlayer('a', 'left', L1);
  const left: PlayerState = { ...p, facing: 'left' };
  const right: PlayerState = { ...p, facing: 'right' };
  expect(bodyBox(left)).toEqual(bodyBox(right));
});

test('edge spawn is clamped inside the world and lands', () => {
  let p = createPlayer('a', 'left', L1);
  // The converted spawn hangs off the left edge and sinks 0.45 px into the floor.
  expect(bodyBox(p).x).toBeLessThan(0);
  expect(bodyBox(p).y + bodyBox(p).height).toBeGreaterThan(FLOOR_TOP);
  let ticks = 0;
  do {
    p = settle(p);
    ticks++;
    expect(bodyBox(p).x).toBeGreaterThanOrEqual(0);
  } while (!p.onFloor && ticks < 60);
  expect(p.onFloor).toBe(true);
  // On top of the floor, not inside it.
  expect(bodyBox(p).y + bodyBox(p).height).toBeCloseTo(FLOOR_TOP, 9);
  // Stays put once landed.
  const later = run(p, 10, {}).at(-1)!.player;
  expect([later.x, later.y, later.onFloor]).toEqual([p.x, p.y, true]);
});

test('left spawn settles on floor and inside bounds', () => {
  const p = settle(createPlayer('a', 'left', L1));
  expect(p.x).toBeCloseTo(LEFT_WALL_X, 6);
  expect(p.y).toBeCloseTo(FLOOR_Y, 6);
  expect(p.onFloor).toBe(true);
  expect(Object.is(p.vx, 0)).toBe(true);
  expect(Object.is(p.vy, 0)).toBe(true);
});

test('right spawn settles against right bound', () => {
  const p = settle(createPlayer('b', 'right', L1));
  expect(p.x).toBeCloseTo(RIGHT_WALL_X, 6);
  expect(p.y).toBeCloseTo(FLOOR_Y, 6);
  expect(p.facing).toBe('left');
  expect(p.onFloor).toBe(true);
});

test('respawn resets motion', () => {
  const moving: PlayerState = {
    ...settle(createPlayer('a', 'left', L1)),
    x: 400,
    y: 100,
    vx: 270,
    vy: -300,
    facing: 'left',
    ammo: 5,
    score: 3,
    jumpBufferTicks: 3,
    coyoteTicks: 4,
    shotPoseTicks: 7,
  };
  const r = respawn(moving, L1);
  const spawn = createPlayer('a', 'left', L1);
  expect(r).toMatchObject({
    x: spawn.x,
    y: spawn.y,
    vx: 0,
    vy: 0,
    jumpBufferTicks: 0,
    coyoteTicks: 0,
    shotPoseTicks: 0,
    onFloor: false,
    facing: 'left',
    ammo: 5,
    score: 3,
  });
  expect(moving.vx).toBe(270);
});

test('momentum: run starts at 45 px/s and reaches 270 on tick 6', () => {
  const start = settle(createPlayer('a', 'left', L1));
  const vxs = run(start, 8, { right: true }).map((r) => r.player.vx);
  // 270 / groundAccelTicks (6) = 45 px/s gained per tick, capped at runSpeed.
  expect(vxs).toEqual([45, 90, 135, 180, 225, 270, 270, 270]);
});

test('runs up to 4.5 px per tick', () => {
  const start = settle(createPlayer('a', 'left', L1));
  const results = run(start, 10, { right: true });
  const last = results.at(-1)!.player;
  // (45 + 90 + 135 + 180 + 225 + 5 * 270) / 60 = 33.75 px over the 10 ticks.
  expect(last.x).toBeCloseTo(LEFT_WALL_X + 33.75, 6);
  expect(last.y).toBeCloseTo(FLOOR_Y, 6);
  expect(last.facing).toBe('right');
  expect(last.vx).toBe(270);
  expect(results.at(-1)!.player.x - results.at(-2)!.player.x).toBeCloseTo(4.5, 9);
  expect(results[0]!.player.x).toBeCloseTo(LEFT_WALL_X + 0.75, 6);
  expect(results[0]!.player.anim).toBe('idle');
  for (const r of results.slice(1)) expect(r.player.anim).toBe('run');
});

test('turning at a ledge edge does not move the hitbox or drop the player', () => {
  // Level 1 row 15, cols 1-4: a block spanning x 32..160 with its top at y 450, open air to its right.
  const blockRight = 160;
  const blockTop = 450;
  const overhang = 10;
  const p = standingAt(blockRight + overhang - 27.6 / 2, blockTop - 34.5 / 2, 'left');
  expect(p.onFloor).toBe(true);
  expect(p.vx).toBe(0);
  const box0 = bodyBox(p);
  expect(box0.x + box0.width).toBeCloseTo(blockRight + overhang, 9);

  const turnRight = stepPlayer(p, input({ right: true }), L1).player;
  expect(turnRight.facing).toBe('right');
  expect(bodyBox(turnRight).x - box0.x).toBeCloseTo(45 / 60, 9);
  expect(turnRight.onFloor).toBe(true);

  const turnLeft = stepPlayer(turnRight, input({ left: true }), L1).player;
  expect(turnLeft.facing).toBe('left');
  expect(bodyBox(turnLeft).x - bodyBox(turnRight).x).toBeCloseTo(turnLeft.vx * DT, 9);
  expect(turnLeft.onFloor).toBe(true);
});

test('jump apex is 87.5 px above floor', () => {
  const start = settle(createPlayer('a', 'left', L1));
  const results = [stepPlayer(start, input({ jumpPressed: true }), L1)];
  while (!results.at(-1)!.player.onFloor) {
    expect(results.length).toBeLessThan(200);
    results.push(stepPlayer(results.at(-1)!.player, input(), L1));
  }
  const minY = Math.min(...results.map((r) => r.player.y));
  expect(minY).toBeCloseTo(FLOOR_Y - 87.5, 6);
  expect(results[0]!.jumped).toBe(true);
  expect(results.slice(1).every((r) => !r.jumped)).toBe(true);
  expect(results.at(-1)!.player.y).toBeCloseTo(FLOOR_Y, 6);
  // Animation is chosen before movement: on the jump tick the player was still on the floor.
  expect(results[0]!.player.anim).toBe('idle');
  expect(results[1]!.player.anim).toBe('jump');
  expect(results.at(-1)!.player.anim).toBe('fall');
});

test('no jump while airborne', () => {
  const start = settle(createPlayer('a', 'left', L1));
  const airborne = stepPlayer(start, input({ jumpPressed: true }), L1).player;
  expect(airborne.onFloor).toBe(false);
  const r = stepPlayer(airborne, input({ jumpPressed: true }), L1);
  expect(r.jumped).toBe(false);
  expect(r.player.vy).toBeGreaterThan(airborne.vy);
});

test('pressing jump every tick re-jumps the tick after landing', () => {
  const start = settle(createPlayer('a', 'left', L1));
  const results = run(start, 120, { jumpPressed: true });
  expect(results[0]!.jumped).toBe(true);
  const landed = results.findIndex((r, i) => i > 0 && r.player.onFloor);
  expect(landed).toBeGreaterThan(0);
  expect(results.slice(1, landed + 1).every((r) => !r.jumped)).toBe(true);
  expect(results[landed + 1]!.jumped).toBe(true);
});

test('a fall lands flush on the floor and stops', () => {
  const r = run({ ...createPlayer('a', 'left', L1), x: 300, y: 400 }, 60, {});
  const landed = r.findIndex((s) => s.player.onFloor);
  expect(landed).toBeGreaterThan(0);
  const p = r[landed]!.player;
  expect(p.y).toBeCloseTo(FLOOR_Y, 9);
  expect(p.vy).toBe(0);
  expect(r.at(-1)!.player.y).toBeCloseTo(FLOOR_Y, 9);
});

test('cooldown: shots on tick 1 and tick 62 only, ammo 2 → 0', () => {
  const start = settle(createPlayer('a', 'left', L1));
  const firstSeq = seq + 1;
  const results = run(start, 70, { shootPressed: true });
  const shotTicks = results.flatMap((r, i) => (r.bullet ? [i + 1] : []));
  expect(shotTicks).toEqual([1, 62]);
  expect(results[0]!.bullet).toEqual({
    id: `a:${firstSeq}`,
    ownerId: 'a',
    // The gun sits on the sprite: hitbox centre + 5.5 source px forward, then 4 up and 5 down.
    x: expect.closeTo(LEFT_WALL_X + 5.5 * 2.3, 6),
    y: expect.closeTo(FLOOR_Y - 4 * 2.3 + 5, 6),
    vx: 600,
  });
  expect(results[61]!.bullet!.id).toBe(`a:${firstSeq + 61}`);
  expect(results[0]!.player.ammo).toBe(1);
  expect(results[0]!.player.ticksSinceShot).toBe(0);
  expect(results[0]!.player.shotPoseTicks).toBe(MOVEMENT.shotPoseTicks);
  expect(results[1]!.player.shotPoseTicks).toBe(MOVEMENT.shotPoseTicks - 1);
  expect(results[60]!.player.ammo).toBe(1);
  expect(results.at(-1)!.player.ammo).toBe(0);
  expect(results[0]!.player.anim).toBe('shoot');
});

test('no bullet with zero ammo but anim is not shoot', () => {
  const start = { ...settle(createPlayer('a', 'left', L1)), ammo: 0 };
  const r = stepPlayer(start, input({ shootPressed: true }), L1);
  expect(r.bullet).toBeNull();
  expect(r.player.anim).toBe('idle');
  expect(r.player.ammo).toBe(0);
  expect(r.player.shotPoseTicks).toBe(0);
});

test('facing left fires negative velocity', () => {
  const start = settle(createPlayer('b', 'right', L1));
  const r = stepPlayer(start, input({ shootPressed: true }), L1);
  expect(r.bullet).not.toBeNull();
  expect(r.bullet!.vx).toBe(-600);
  expect(r.bullet!.ownerId).toBe('b');
  expect(r.bullet!.x).toBeCloseTo(RIGHT_WALL_X - 5.5 * 2.3, 6);
});

test('bullet leaves from the gun in the new facing', () => {
  // Flush against the left bound, so pressing left turns the player without moving the hitbox.
  const start = settle(createPlayer('a', 'left', L1));
  expect(start.facing).toBe('right');
  const r = stepPlayer(start, input({ shootPressed: true, left: true }), L1);
  const next = r.player;
  expect(next.facing).toBe('left');
  expect(next.x).toBe(start.x);
  expect(r.bullet!.vx).toBe(-600);
  expect(r.bullet!.x).toBeCloseTo(spriteCentre(next, 'left').x, 9);
});

test('stepPlayer is pure and deterministic', () => {
  const p = createPlayer('a', 'left', L1);
  const snapshot = { ...p }; // PlayerState is flat, so a spread is a full copy
  const frame = input({ right: true, jumpPressed: true, shootPressed: true });
  const a = stepPlayer(p, frame, L1);
  const b = stepPlayer(p, frame, L1);
  expect(p).toEqual(snapshot);
  expect(a).toEqual(b);
  expect(a.player).not.toBe(p);
});
