import { describe, expect, test } from 'vitest';
import { GRAVITY_Y, JUMP_VELOCITY } from '../src/constants.ts';
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
  // Facing left the art is mirrored and sits 4.5 source px right of the hitbox centre (the original's offset 12).
  expect(b.x).toBeCloseTo(803 + 4.5 * 2.3, 6);
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

test('momentum: run gains one accel step per tick and reaches runSpeed on tick groundAccelTicks', () => {
  const { runSpeed, groundAccelTicks } = MOVEMENT;
  const accel = runSpeed / groundAccelTicks;
  const start = settle(createPlayer('a', 'left', L1));
  const vxs = run(start, groundAccelTicks + 2, { right: true }).map((r) => r.player.vx);
  vxs.forEach((vx, i) => {
    if (i + 1 >= groundAccelTicks) expect(vx).toBe(runSpeed);
    else expect(vx).toBeCloseTo(accel * (i + 1), 9);
  });
});

test('runs up to runSpeed * DT per tick', () => {
  const { runSpeed, groundAccelTicks } = MOVEMENT;
  const accel = runSpeed / groundAccelTicks;
  const ticks = groundAccelTicks + 4;
  const start = settle(createPlayer('a', 'left', L1));
  const results = run(start, ticks, { right: true });
  const last = results.at(-1)!.player;
  let distance = 0;
  for (let i = 1; i <= ticks; i++) distance += Math.min(accel * i, runSpeed) * DT;
  expect(last.x).toBeCloseTo(LEFT_WALL_X + distance, 6);
  expect(last.y).toBeCloseTo(FLOOR_Y, 6);
  expect(last.facing).toBe('right');
  expect(last.vx).toBe(runSpeed);
  expect(results.at(-1)!.player.x - results.at(-2)!.player.x).toBeCloseTo(runSpeed * DT, 9);
  expect(results[0]!.player.x).toBeCloseTo(LEFT_WALL_X + accel * DT, 6);
  for (const r of results) expect(r.player.anim).toBe('run');
});

test('run while vx !== 0 on the floor, idle at 0', () => {
  const start = settle(createPlayer('a', 'left', L1));
  const running = run(start, MOVEMENT.groundAccelTicks + 2, { right: true }).at(-1)!.player;
  const decel = run(running, MOVEMENT.groundDecelTicks + 10, {});
  const stopped = decel.findIndex((r) => r.player.vx === 0);
  expect(stopped).toBeGreaterThan(0);
  for (const r of decel.slice(0, stopped)) expect(r.player.anim).toBe('run');
  for (const r of decel.slice(stopped)) expect(r.player.anim).toBe('idle');
});

test('anim reflects this tick: the first jumping tick is already jump', () => {
  const start = settle(createPlayer('a', 'left', L1));
  expect(stepPlayer(start, input({ jumpPressed: true }), L1).player.anim).toBe('jump');
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
  expect(bodyBox(turnRight).x - box0.x).toBeCloseTo(
    (MOVEMENT.runSpeed / MOVEMENT.groundAccelTicks) * DT,
    9,
  );
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
  expect(results[0]!.player.anim).toBe('jump');
  expect(results[1]!.player.anim).toBe('jump');
  // The landing tick is judged by where the player ended up, so it is already idle.
  expect(results.at(-2)!.player.anim).toBe('fall');
  expect(results.at(-1)!.player.anim).toBe('idle');
});

test('no jump while airborne', () => {
  const start = settle(createPlayer('a', 'left', L1));
  const airborne = stepPlayer(start, input({ jumpPressed: true }), L1).player;
  expect(airborne.onFloor).toBe(false);
  const r = stepPlayer(airborne, input({ jumpPressed: true }), L1);
  expect(r.jumped).toBe(false);
  expect(r.player.vy).toBeGreaterThan(airborne.vy);
});

test('press while grounded jumps on the same tick', () => {
  const start = settle(createPlayer('a', 'left', L1));
  const r = stepPlayer(start, input({ jumpPressed: true }), L1);
  expect(r.jumped).toBe(true);
  expect(r.player.vy).toBeLessThan(0);
});

test('holding jump through a landing does not jump again', () => {
  const start = settle(createPlayer('a', 'left', L1));
  const first = stepPlayer(start, input({ jumpPressed: true }), L1);
  const rest = run(first.player, 120, { jumpPressed: false });
  expect(rest.some((r) => r.player.onFloor)).toBe(true);
  expect([first, ...rest].filter((r) => r.jumped)).toHaveLength(1);
});

/** Index of the tick that lands, dropping from mid-air with no input. */
function landingIndex(from: PlayerState): number {
  const landed = run(from, 120, {}).findIndex((r) => r.player.onFloor);
  expect(landed).toBeGreaterThan(0);
  return landed;
}

/** Drops from mid-air, pressing jump once at tick `pressAt` (0-based); returns each tick's `jumped`. */
function dropPressingAt(pressAt: number, ticks: number): boolean[] {
  let p: PlayerState = { ...createPlayer('a', 'left', L1), x: 300, y: 400 };
  const jumps: boolean[] = [];
  for (let i = 0; i < ticks; i++) {
    const r = stepPlayer(p, input({ jumpPressed: i === pressAt }), L1);
    jumps.push(r.jumped);
    p = r.player;
  }
  return jumps;
}

test('buffered press N-1 ticks before the first on-floor tick jumps; N before does not', () => {
  const air = { ...createPlayer('a', 'left', L1), x: 300, y: 400 };
  const landing = landingIndex(air);
  // The first tick that starts on the floor is landing + 1; a press on tick p is honoured p..p+N-1.
  const first = landing + 1;
  const n = MOVEMENT.jumpBufferTicks;
  const honoured = dropPressingAt(first - (n - 1), landing + 4);
  expect(honoured.indexOf(true)).toBe(first);
  expect(honoured.filter(Boolean)).toHaveLength(1);
  expect(dropPressingAt(first - n, landing + 4).some(Boolean)).toBe(false);
});

/** Walks off the level 1 block's right edge; returns the state after tick q (first airborne tick). */
function walkedOffLedge(): PlayerState {
  const blockRight = 160;
  const blockTop = 450;
  let p = standingAt(blockRight + 2 - 27.6 / 2, blockTop - 34.5 / 2, 'right');
  expect(p.onFloor).toBe(true);
  for (let i = 0; i < 60 && p.onFloor; i++) p = stepPlayer(p, input({ right: true }), L1).player;
  expect(p.onFloor).toBe(false);
  expect(p.coyoteTicks).toBe(MOVEMENT.coyoteTicks);
  return p;
}

/** Presses jump on tick q+k after walking off (k >= 1); the ticks between are neutral. */
function jumpedAfterLedge(k: number, extraPressAt?: number): boolean[] {
  let p = walkedOffLedge();
  const jumps: boolean[] = [];
  for (let i = 1; i <= Math.max(k, extraPressAt ?? 0) + 1; i++) {
    const press = i === k || i === extraPressAt;
    const r = stepPlayer(p, input({ jumpPressed: press }), L1);
    jumps.push(r.jumped);
    p = r.player;
  }
  return jumps;
}

test('coyote: jump N ticks after walking off a ledge jumps; N+1 does not', () => {
  const n = MOVEMENT.coyoteTicks;
  expect(jumpedAfterLedge(n)[n - 1]).toBe(true);
  expect(jumpedAfterLedge(n + 1).some(Boolean)).toBe(false);
  expect(jumpedAfterLedge(1)[0]).toBe(true);
});

test('coyote is spent by the jump', () => {
  // Second press lands inside the original window but finds it spent.
  const jumps = jumpedAfterLedge(2, 4);
  expect(jumps).toHaveLength(5);
  expect(jumps.filter(Boolean)).toHaveLength(1);
  expect(jumps[1]).toBe(true);
});

test('a jump off the floor does not start coyote time', () => {
  const start = settle(createPlayer('a', 'left', L1));
  const r = stepPlayer(start, input({ jumpPressed: true }), L1);
  expect([r.player.coyoteTicks, r.player.jumpBufferTicks]).toEqual([0, 0]);
});

test('landing clears coyote time', () => {
  // Hand-set a window that would still be open on landing, a couple of ticks above the floor.
  const falling: PlayerState = {
    ...createPlayer('a', 'left', L1),
    x: 300,
    y: FLOOR_Y - 2,
    coyoteTicks: MOVEMENT.coyoteTicks,
  };
  const landed = run(falling, 10, {}).find((r) => r.player.onFloor)!.player;
  expect(landed.coyoteTicks).toBe(0);
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

/** Steps with a shoot press on exactly the 0-based ticks in `pressAt`, none elsewhere. */
function runPressing(p: PlayerState, ticks: number, pressAt: number[]): PlayerStepResult[] {
  const results: PlayerStepResult[] = [];
  let current = p;
  for (let i = 0; i < ticks; i++) {
    const r = stepPlayer(current, input({ shootPressed: pressAt.includes(i) }), L1);
    results.push(r);
    current = r.player;
  }
  return results;
}

test('a shot fires from the gun and spends one round', () => {
  const start = settle(createPlayer('a', 'left', L1));
  const firstSeq = seq + 1;
  const r = runPressing(start, 1, [0])[0]!;
  expect(r.bullet).toEqual({
    id: `a:${firstSeq}`,
    ownerId: 'a',
    // The gun sits on the sprite: hitbox centre + 5.5 source px forward, then 4 up and 5 down.
    x: expect.closeTo(LEFT_WALL_X + 5.5 * 2.3, 6),
    y: expect.closeTo(FLOOR_Y - 4 * 2.3 + 5, 6),
    vx: 600,
  });
  expect(r.player.ammo).toBe(1);
  expect(r.player.ticksSinceShot).toBe(0);
});

test('cooldown: a press one tick early is refused, the next one fires', () => {
  const start = settle(createPlayer('a', 'left', L1));
  const results = runPressing(start, 70, [0, 60, 61]);
  const shotTicks = results.flatMap((r, i) => (r.bullet ? [i] : []));
  expect(shotTicks).toEqual([0, 61]);
  expect(results.at(-1)!.player.ammo).toBe(0);
});

test('a shot shows the pose for exactly shotPoseTicks ticks', () => {
  const n = MOVEMENT.shotPoseTicks;
  const start = settle(createPlayer('a', 'left', L1));
  const anims = runPressing(start, n + 2, [0]).map((r) => r.player.anim);
  expect(anims.slice(0, n)).toEqual(Array(n).fill('shoot'));
  expect(anims.slice(n)).toEqual(['idle', 'idle']);
});

test('a press on cooldown shows no pose and fires nothing', () => {
  const start = settle(createPlayer('a', 'left', L1));
  // Pose from the first shot has ended by tick t, but the cooldown (60 ticks) has not.
  const t = MOVEMENT.shotPoseTicks + 8;
  const r = runPressing(start, t + 1, [0, t]);
  expect(r[t]!.bullet).toBeNull();
  expect(r[t]!.player.anim).toBe('idle');
  expect(r[t]!.player.shotPoseTicks).toBe(0);
});

test('a press with no ammo shows no pose', () => {
  const start = { ...settle(createPlayer('a', 'left', L1)), ammo: 0 };
  const r = stepPlayer(start, input({ shootPressed: true }), L1);
  expect(r.bullet).toBeNull();
  expect(r.player.anim).toBe('idle');
  expect(r.player.ammo).toBe(0);
  expect(r.player.shotPoseTicks).toBe(0);
});

test('holding shoot does not fire again after the cooldown', () => {
  const start = settle(createPlayer('a', 'left', L1));
  const results = runPressing(start, 121, [0]);
  expect(results.filter((r) => r.bullet)).toHaveLength(1);
});

test('facing left fires negative velocity', () => {
  const start = settle(createPlayer('b', 'right', L1));
  const r = stepPlayer(start, input({ shootPressed: true }), L1);
  expect(r.bullet).not.toBeNull();
  expect(r.bullet!.vx).toBe(-600);
  expect(r.bullet!.ownerId).toBe('b');
  expect(r.bullet!.x).toBeCloseTo(RIGHT_WALL_X - 4.5 * 2.3, 6);
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

describe('step trace', () => {
  const GRAVITY_TICK = GRAVITY_Y / 60;

  test('standing reports the floor only, and gravity the floor then cancels', () => {
    const r = stepPlayer(standingAt(400, FLOOR_Y, 'right'), input(), L1);
    expect(r.trace.contacts).toEqual({ left: false, right: false, up: false, down: true });
    expect(r.trace.accel.x).toBe(0);
    expect(r.trace.accel.y).toBeCloseTo(GRAVITY_TICK, 9);
  });

  test('walking into the left wall reports left', () => {
    const results = run(standingAt(LEFT_WALL_X, FLOOR_Y, 'left'), 2, { left: true });
    expect(results.at(-1)!.trace.contacts.left).toBe(true);
  });

  test('a ground start reports run acceleration', () => {
    const r = stepPlayer(standingAt(400, FLOOR_Y, 'right'), input({ right: true }), L1);
    expect(r.trace.accel.x).toBeCloseTo(MOVEMENT.runSpeed / MOVEMENT.groundAccelTicks, 9);
  });

  test('a jump tick reports the impulse plus gravity', () => {
    const start = standingAt(400, FLOOR_Y, 'right');
    const r = stepPlayer(start, input({ jumpPressed: true }), L1);
    expect(r.trace.accel.y).toBeCloseTo(JUMP_VELOCITY + GRAVITY_TICK - start.vy, 9);
  });

  test('an airborne tick reports one tick of gravity and no contacts', () => {
    const start = standingAt(400, FLOOR_Y, 'right');
    const airborne = stepPlayer(start, input({ jumpPressed: true }), L1).player;
    const r = stepPlayer(airborne, input(), L1);
    expect(r.trace.accel.y).toBeCloseTo(GRAVITY_TICK, 9);
    expect(r.trace.contacts).toEqual({ left: false, right: false, up: false, down: false });
  });

  test('a plain step reports no assist', () => {
    expect(stepPlayer(standingAt(400, FLOOR_Y, 'right'), input(), L1).trace.assist).toBeNull();
  });
});
