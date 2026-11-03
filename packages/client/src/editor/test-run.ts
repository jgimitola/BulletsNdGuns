import {
  buildLevel,
  createWorld,
  isPlayable,
  stepWorld,
  type InputKeys,
  type Level,
  type LevelData,
  type WorldEvent,
  type WorldState,
} from '@bng/shared';

export type TestOutcome = 'playing' | 'completed';

export const TESTER_ID = 'tester';

/**
 * One player alone in a level, run with the same simulation the server uses: the editor's Test.
 * No room and no server; the run ends when the player reaches the portal.
 */
export class TestRun {
  readonly level: Level;
  private state: WorldState;
  private result: TestOutcome = 'playing';
  private seq = 0;

  /** Throws when the level isn't playable (the toolbar never offers Test then). */
  constructor(data: LevelData) {
    if (!isPlayable(data)) throw new Error('A level needs both spawns and the portal to be tested');
    this.level = buildLevel(data);
    this.state = this.fresh();
  }

  get world(): WorldState {
    return this.state;
  }

  get outcome(): TestOutcome {
    return this.result;
  }

  get coins(): { collected: number; total: number } {
    const total = this.level.coins.length;
    return { collected: total - this.state.coins.length, total };
  }

  /** One 60 Hz tick for the one player. Stops changing once completed. */
  step(keys: InputKeys): WorldEvent[] {
    if (this.result === 'completed') return [];
    this.seq++;
    const inputs = new Map([[TESTER_ID, { seq: this.seq, level: 0, ...keys }]]);
    const { world, events } = stepWorld(this.state, inputs, this.level);
    this.state = world;
    if (events.some((e) => e.type === 'levelCompleted')) this.result = 'completed';
    return events;
  }

  restart(): void {
    this.state = this.fresh();
    this.result = 'playing';
    this.seq = 0;
  }

  private fresh(): WorldState {
    return createWorld([{ id: TESTER_ID, side: 'left' }], this.level);
  }
}
