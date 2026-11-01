import { describe, expect, it } from 'vitest';
import {
  NEUTRAL_INPUT,
  createWorld,
  getLevel,
  stepPlayer,
  stepWorld,
  toSnapshot,
  type InputFrame,
  type PlayerState,
  type Snapshot,
} from '@bng/shared';
import { LocalPlayerPredictor } from '../src/net/prediction.ts';

const level = getLevel(0);
const keys = (o: Partial<Omit<InputFrame, 'seq'>> = {}): Omit<InputFrame, 'seq'> => ({
  ...NEUTRAL_INPUT,
  ...o,
});

function setup() {
  const world = createWorld([{ id: 'me', side: 'left' }]);
  const first = world.players[0] as PlayerState;
  return { world, predictor: new LocalPlayerPredictor('me', 0, first), first };
}

function snap(player: PlayerState, ackSeq: number, levelIndex = 0): Snapshot {
  return {
    tick: 0,
    levelIndex,
    ackSeq,
    players: [player],
    bullets: [],
    ammoPickupIds: [],
    coinIds: [],
  };
}

describe('LocalPlayerPredictor', () => {
  it('numbers frames from 1', () => {
    const { predictor } = setup();
    expect(predictor.applyInput(keys()).frame.seq).toBe(1);
    expect(predictor.applyInput(keys()).frame.seq).toBe(2);
  });

  it('matches server when server applies same inputs', () => {
    const { predictor } = setup();
    let world = createWorld([{ id: 'me', side: 'left' }]);
    for (let i = 0; i < 30; i++) {
      const { frame } = predictor.applyInput(keys({ right: true }));
      world = stepWorld(world, new Map([['me', frame]])).world;
    }
    predictor.reconcile(toSnapshot(world, 30));
    expect(predictor.state).toEqual(world.players[0]);
    expect(predictor.pending).toHaveLength(0);
  });

  it('reconcile replays unacked inputs', () => {
    const { predictor, first } = setup();
    const frames: InputFrame[] = [];
    for (let i = 0; i < 10; i++) frames.push(predictor.applyInput(keys({ right: true })).frame);
    // Server state at ack 6, deliberately offset so the replay is observable.
    let server = first;
    for (const f of frames.slice(0, 6)) server = stepPlayer(server, f, level).player;
    server = { ...server, x: server.x + 50 };
    predictor.reconcile(snap(server, 6));
    let expected = server;
    for (const f of frames.slice(6)) expected = stepPlayer(expected, f, level).player;
    expect(predictor.state).toEqual(expected);
    expect(predictor.pending.map((f) => f.seq)).toEqual([7, 8, 9, 10]);
  });

  it('replayed shots are not reported again', () => {
    const { predictor, first } = setup();
    const results = [1, 2, 3].map(() => predictor.applyInput(keys({ shoot: true, jump: true })));
    expect(results.filter((r) => r.bullet !== null)).toHaveLength(1);
    const ret = predictor.reconcile(snap(first, 0));
    expect(ret).toBeUndefined();
    expect(predictor.state.ammo).toBe(first.ammo - 1);
    expect(predictor.pending).toHaveLength(3);
    expect(predictor.applyInput(keys()).frame.seq).toBe(4);
  });

  it('ignores snapshots of another level or without the local player', () => {
    const { predictor, first } = setup();
    predictor.applyInput(keys({ right: true }));
    const before = predictor.state;
    predictor.reconcile(snap({ ...first, x: 999 }, 1, 1));
    expect(predictor.state).toEqual(before);
    predictor.reconcile(snap({ ...first, id: 'other', x: 999 }, 1));
    expect(predictor.state).toEqual(before);
    expect(predictor.pending).toHaveLength(1);
  });
});
