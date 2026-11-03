import { describe, expect, test } from 'vitest';
import {
  buildLevel,
  CLASSIC_LEVELS,
  createPlayer,
  NEUTRAL_INPUT,
  type InputKeys,
  type LevelData,
} from '@bng/shared';
import { applyTool, emptyLevel } from '../src/editor/level-edits.ts';
import { TestRun } from '../src/editor/test-run.ts';
import type { Tool } from '../src/editor/tools.ts';

const classic = CLASSIC_LEVELS[0]!.data;
const idle: InputKeys = { ...NEUTRAL_INPUT };
const right: InputKeys = { ...NEUTRAL_INPUT, right: true };

const object = (object: 'portal' | 'spawnLeft' | 'spawnRight' | 'coin'): Tool => ({
  kind: 'object',
  object,
});

/** Left spawn and portal from the same cell: the player starts inside the portal. */
function portalAtStart(): LevelData {
  let data = emptyLevel();
  data = applyTool(data, object('spawnLeft'), { col: 3, row: 10 });
  data = applyTool(data, object('portal'), { col: 3, row: 10 });
  data = applyTool(data, object('spawnRight'), { col: 20, row: 10 });
  return applyTool(data, object('coin'), { col: 12, row: 5 });
}

describe('TestRun', () => {
  test('an unplayable level cannot be tested', () => {
    expect(() => new TestRun(emptyLevel())).toThrow();
  });

  test('the player starts alone at the left spawn', () => {
    const run = new TestRun(classic);
    expect(run.world.players).toEqual([createPlayer('tester', 'left', buildLevel(classic))]);
    expect(run.outcome).toBe('playing');
    expect(run.world.coins).toHaveLength(classic.coins.length);
  });

  test('stepping with right held moves the player right', () => {
    const run = new TestRun(classic);
    const x = run.world.players[0]!.x;
    for (let i = 0; i < 20; i++) run.step(right);
    expect(run.world.players[0]!.x).toBeGreaterThan(x);
  });

  test('reaching the portal completes the run and freezes it', () => {
    const run = new TestRun(portalAtStart());
    const events = run.step(idle);
    expect(events.some((e) => e.type === 'levelCompleted')).toBe(true);
    expect(run.outcome).toBe('completed');
    const frozen = run.world;
    expect(run.step(right)).toEqual([]);
    expect(run.world).toBe(frozen);
  });

  test('restart puts everything back', () => {
    const run = new TestRun(classic);
    for (let i = 0; i < 30; i++) run.step(right);
    const done = new TestRun(portalAtStart());
    done.step(idle);
    run.restart();
    done.restart();
    expect(run.world.players[0]).toEqual(createPlayer('tester', 'left', run.level));
    expect(run.world.tick).toBe(0);
    expect(done.outcome).toBe('playing');
    expect(done.world.coins).toHaveLength(1);
  });

  test('the coin count is the coins collected out of the level total', () => {
    const run = new TestRun(classic);
    expect(run.coins).toEqual({ collected: 0, total: classic.coins.length });
  });
});
