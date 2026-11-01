import { describe, expect, test } from 'vitest';
import {
  LEVELS,
  NEVER_SHOT_TICKS,
  STARTING_AMMO,
  getLevel,
  type InputFrame,
  type PlayerId,
  type ServerToClientEvents,
  type Snapshot,
  type WorldState,
} from '@bng/shared';
import { Room, type RoomTransport, type TickScheduler } from '../src/rooms/room.ts';
import { RoomManager } from '../src/rooms/room-manager.ts';

interface Sent {
  to: PlayerId;
  event: keyof ServerToClientEvents;
  args: unknown[];
}

class FakeTransport implements RoomTransport {
  sent: Sent[] = [];
  send<E extends keyof ServerToClientEvents>(
    playerId: PlayerId,
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ): void {
    this.sent.push({ to: playerId, event, args });
  }
  of(to: PlayerId, event: keyof ServerToClientEvents): Sent[] {
    return this.sent.filter((s) => s.to === to && s.event === event);
  }
}

class FakeScheduler implements TickScheduler {
  starts = 0;
  stops = 0;
  start(): void {
    this.starts++;
  }
  stop(): void {
    this.stops++;
  }
}

function setup() {
  const transport = new FakeTransport();
  const scheduler = new FakeScheduler();
  const room = new Room('r', transport, scheduler);
  return { room, transport, scheduler };
}

function startMatch(ids: PlayerId[] = ['a', 'b']) {
  const ctx = setup();
  for (const id of ids) ctx.room.join(id);
  for (const id of ids) ctx.room.markReady(id);
  return ctx;
}

const frame = (seq: number, keys: Partial<InputFrame> = {}): InputFrame => ({
  seq,
  level: 0,
  left: false,
  right: false,
  jump: false,
  shoot: false,
  ...keys,
});

function ticks(room: Room, n: number): void {
  for (let i = 0; i < n; i++) room.tick();
}

function xOf(room: Room, id: PlayerId): number {
  return room.worldForTest()!.players.find((p) => p.id === id)!.x;
}

function snapshots(t: FakeTransport, id: PlayerId): Snapshot[] {
  return t.of(id, 'snapshot').map((s) => s.args[0] as Snapshot);
}

function snapshotAck(t: FakeTransport, id: PlayerId): number {
  const snaps = t.of(id, 'snapshot');
  return (snaps[snaps.length - 1]!.args[0] as { ackSeq: number }).ackSeq;
}

/** Moves player `id` onto the current level portal. */
function placeOnPortal(room: Room, id: PlayerId, world: WorldState = room.worldForTest()!): void {
  const portal = getLevel(world.levelIndex).portal;
  room.__setWorldForTest({
    ...world,
    players: world.players.map((p) => (p.id === id ? { ...p, x: portal.x - 4, y: portal.y } : p)),
  });
}

describe('Room', () => {
  test('starts only when >= 2 players and all ready', () => {
    const { room, transport, scheduler } = setup();
    room.join('a');
    room.markReady('a');
    expect(room.phaseKind).toBe('lobby');
    room.join('b');
    expect(room.phaseKind).toBe('lobby');
    room.markReady('b');
    expect(room.phaseKind).toBe('playing');
    expect(transport.of('a', 'levelStarted')).toHaveLength(1);
    expect(transport.of('b', 'levelStarted')).toHaveLength(1);
    const payload = transport.of('a', 'levelStarted')[0]!.args[0] as { levelIndex: number };
    expect(payload.levelIndex).toBe(0);
    expect(scheduler.starts).toBe(1);
  });

  test('a lone remaining ready player does not start', () => {
    const { room, scheduler } = setup();
    room.join('a');
    room.join('b');
    room.markReady('a');
    room.leave('b');
    expect(room.phaseKind).toBe('lobby');
    expect(scheduler.starts).toBe(0);
  });

  test('leaving can start the match when the rest are all ready', () => {
    const { room } = setup();
    for (const id of ['a', 'b', 'c']) room.join(id);
    room.markReady('a');
    room.markReady('b');
    room.leave('c');
    expect(room.phaseKind).toBe('playing');
  });

  test('join refused while playing and during gameOver', () => {
    const { room } = startMatch();
    expect(room.join('c')).toBe('refused');
    room.__setWorldForTest({ ...room.worldForTest()!, levelIndex: LEVELS.length - 1 });
    placeOnPortal(room, 'a');
    room.tick();
    expect(room.phaseKind).toBe('gameOver');
    expect(room.join('c')).toBe('refused');
    expect(room.playerIds).toEqual(['a', 'b']);
  });

  test('sides alternate by join order', () => {
    const { room } = startMatch(['a', 'b', 'c']);
    const sides = room.worldForTest()!.players.map((p) => [p.id, p.side]);
    expect(sides).toEqual([
      ['a', 'left'],
      ['b', 'right'],
      ['c', 'left'],
    ]);
  });

  test('a joining player takes the side with fewer players; ties go left', () => {
    const { room } = setup();
    room.join('a');
    room.join('b');
    room.leave('a');
    room.join('a2');
    room.markReady('b');
    room.markReady('a2');
    const sides = room.worldForTest()!.players.map((p) => [p.id, p.side]);
    expect(sides).toEqual([
      ['b', 'right'],
      ['a2', 'left'],
    ]);
  });

  test('snapshot every 3 ticks with per-player ackSeq', () => {
    const { room, transport } = startMatch();
    room.queueInput('a', frame(1));
    room.queueInput('a', frame(2));
    room.queueInput('a', frame(3));
    ticks(room, 2);
    expect(transport.of('a', 'snapshot')).toHaveLength(0);
    room.tick();
    expect(transport.of('a', 'snapshot')).toHaveLength(1);
    expect(transport.of('b', 'snapshot')).toHaveLength(1);
    expect(snapshotAck(transport, 'a')).toBe(3);
    expect(snapshotAck(transport, 'b')).toBe(0);
    ticks(room, 3);
    expect(transport.of('a', 'snapshot')).toHaveLength(2);
  });

  test('input queue drops beyond limit and ignores stale seq', () => {
    const { room, transport } = startMatch();
    for (let s = 1; s <= 20; s++) room.queueInput('a', frame(s));
    room.queueInput('a', frame(5));
    room.tick();
    expect(room.ackSeqForTest('a')).toBe(13);
    ticks(room, 2);
    expect(snapshotAck(transport, 'a')).toBe(15);
    // Stale seqs stay ignored; the queue drains to 20 and stays there.
    room.queueInput('a', frame(14));
    ticks(room, 10);
    expect(room.ackSeqForTest('a')).toBe(20);
  });

  test('starvation: last keys reused 6 ticks then neutral', () => {
    const { room } = startMatch();
    room.queueInput('a', frame(1, { right: true }));
    const xs: number[] = [xOf(room, 'a')];
    for (let i = 0; i < 10; i++) {
      room.tick();
      xs.push(xOf(room, 'a'));
    }
    for (let t = 1; t <= 7; t++) expect(xs[t]).toBeGreaterThan(xs[t - 1]!);
    for (let t = 8; t <= 10; t++) expect(xs[t]).toBe(xs[7]);
    expect(room.ackSeqForTest('a')).toBe(1);
  });

  test('starvation reuse is movement-only: one frame with shoot fires exactly one bullet', () => {
    const { room } = startMatch();
    room.queueInput('a', frame(1, { right: true, shoot: true }));
    const xs: number[] = [xOf(room, 'a')];
    room.tick();
    xs.push(xOf(room, 'a'));
    const world = room.worldForTest()!;
    expect(world.players.find((p) => p.id === 'a')!.ammo).toBe(STARTING_AMMO - 1);
    // Plenty of ammo and no cooldown: a reused shoot key would fire again on the very next tick.
    room.__setWorldForTest({
      ...world,
      players: world.players.map((p) =>
        p.id === 'a' ? { ...p, ammo: 5, ticksSinceShot: NEVER_SHOT_TICKS } : p,
      ),
    });
    for (let i = 0; i < 11; i++) {
      room.tick();
      xs.push(xOf(room, 'a'));
    }
    for (let t = 1; t <= 7; t++) expect(xs[t]).toBeGreaterThan(xs[t - 1]!);
    const pa = room.worldForTest()!.players.find((p) => p.id === 'a')!;
    expect(pa.ammo).toBe(5);
  });

  test('a bullet fired and destroyed between snapshots still arrives in the next shots', () => {
    const { room, transport } = startMatch();
    room.tick();
    const world = room.worldForTest()!;
    const b = world.players.find((p) => p.id === 'b')!;
    // a stands just left of b, facing it: the bullet hits b before the tick-3 snapshot.
    room.__setWorldForTest({
      ...world,
      players: world.players.map((p) =>
        p.id === 'a' ? { ...p, x: b.x - 20, y: b.y, facing: 'right' } : p,
      ),
    });
    room.queueInput('a', frame(1, { shoot: true }));
    ticks(room, 2);
    for (const id of ['a', 'b']) {
      const [first] = snapshots(transport, id);
      expect(first!.tick).toBe(3);
      expect(first!.bullets).toEqual([]);
      expect(first!.shots.map((s) => [s.id, s.ownerId])).toEqual([['a:1', 'a']]);
    }
    ticks(room, 3);
    expect(snapshots(transport, 'a')[1]!.shots).toEqual([]);
    const started = transport.of('a', 'levelStarted')[0]!.args[0] as { snapshot: Snapshot };
    expect(started.snapshot.shots).toEqual([]);
  });

  test('lobby frames do not apply once the match starts', () => {
    const { room } = setup();
    room.join('a');
    room.join('b');
    room.queueInput('a', frame(1, { right: true }));
    room.markReady('a');
    room.markReady('b');
    room.tick();
    // Where a settles with no input (see the shared world tests).
    const spawnX = xOf(room, 'a');
    expect(spawnX).toBeCloseTo(26.45, 6);
    expect(room.ackSeqForTest('a')).toBe(0);
    // Still stale afterwards.
    room.queueInput('a', frame(1, { right: true }));
    room.tick();
    expect(xOf(room, 'a')).toBe(spawnX);
    room.queueInput('a', frame(2, { right: true }));
    room.tick();
    expect(xOf(room, 'a')).toBeGreaterThan(spawnX);
  });

  test('a frame tagged with the previous level is dropped but still advances seq', () => {
    const { room } = startMatch();
    placeOnPortal(room, 'a');
    room.tick();
    expect(room.worldForTest()!.levelIndex).toBe(1);
    const spawnX = xOf(room, 'a');
    room.queueInput('a', frame(7, { right: true, level: 0 }));
    room.tick();
    expect(xOf(room, 'a')).toBe(spawnX);
    expect(room.ackSeqForTest('a')).toBe(0);
    // seq 7 was consumed by the dropped frame, so a level-1 copy of it is stale.
    room.queueInput('a', frame(7, { right: true, level: 1 }));
    room.tick();
    expect(xOf(room, 'a')).toBe(spawnX);
    room.queueInput('a', frame(8, { right: true, level: 1 }));
    room.tick();
    expect(xOf(room, 'a')).toBeGreaterThan(spawnX);
    expect(room.ackSeqForTest('a')).toBe(8);
  });

  test('level start clears queued frames but keeps seq staleness and ackSeq', () => {
    const { room, transport } = startMatch();
    for (let s = 1; s <= 5; s++) room.queueInput('a', frame(s, { right: true }));
    placeOnPortal(room, 'a');
    room.tick();
    expect(room.worldForTest()!.levelIndex).toBe(1);
    expect(room.ackSeqForTest('a')).toBe(1);
    const spawnX = xOf(room, 'a');
    ticks(room, 4);
    expect(xOf(room, 'a')).toBe(spawnX);
    expect(room.ackSeqForTest('a')).toBe(1);
    // Old seqs stay stale; a fresh one is accepted.
    room.queueInput('a', frame(3, { right: true, level: 1 }));
    room.tick();
    expect(xOf(room, 'a')).toBe(spawnX);
    room.queueInput('a', frame(6, { right: true, level: 1 }));
    room.tick();
    expect(room.ackSeqForTest('a')).toBe(6);
    expect(transport.of('a', 'levelStarted')).toHaveLength(2);
  });

  test('portal advances level once and sends levelStarted', () => {
    const { room, transport } = startMatch();
    placeOnPortal(room, 'a');
    room.tick();
    expect(room.phaseKind).toBe('playing');
    expect(room.worldForTest()!.levelIndex).toBe(1);
    for (const id of ['a', 'b']) {
      const started = transport.of(id, 'levelStarted');
      expect(started).toHaveLength(2);
      expect((started[1]!.args[0] as { levelIndex: number }).levelIndex).toBe(1);
    }
    const spawn = getLevel(1).spawns.left;
    expect(room.worldForTest()!.players[0]!.y).toBeCloseTo(spawn.y, 0);
    room.tick();
    expect(transport.of('a', 'levelStarted')).toHaveLength(2);
  });

  test('last portal ends match: matchEnded, scheduler stopped, phase gameOver', () => {
    const { room, transport, scheduler } = startMatch();
    room.__setWorldForTest({ ...room.worldForTest()!, levelIndex: LEVELS.length - 1 });
    placeOnPortal(room, 'a');
    room.tick();
    expect(room.phaseKind).toBe('gameOver');
    expect(scheduler.stops).toBe(1);
    const payloads = ['a', 'b'].map((id) => {
      const ended = transport.of(id, 'matchEnded');
      expect(ended).toHaveLength(1);
      return ended[0]!.args[0] as { scores: { id: string; score: number }[] };
    });
    // Standing on the portal may also pick up a coin on the same tick, so only a's score is open.
    expect(payloads[0]).toEqual(payloads[1]);
    expect(payloads[0]!.scores.map((s) => s.id)).toEqual(['a', 'b']);
    expect(payloads[0]!.scores[1]!.score).toBe(0);
  });

  test('leave during playing removes player and keeps ticking', () => {
    const { room, transport } = startMatch();
    room.leave('b');
    expect(room.phaseKind).toBe('playing');
    expect(room.playerIds).toEqual(['a']);
    expect(() => ticks(room, 3)).not.toThrow();
    const snap = transport.of('a', 'snapshot')[0]!.args[0] as { players: { id: string }[] };
    expect(snap.players.map((p) => p.id)).toEqual(['a']);
    expect(transport.of('b', 'snapshot')).toHaveLength(0);
  });

  test('room resets to lobby when everyone leaves', () => {
    const { room, scheduler } = startMatch();
    room.__setWorldForTest({ ...room.worldForTest()!, levelIndex: LEVELS.length - 1 });
    placeOnPortal(room, 'a');
    room.tick();
    expect(room.phaseKind).toBe('gameOver');
    room.leave('a');
    room.leave('b');
    expect(room.phaseKind).toBe('lobby');
    expect(scheduler.stops).toBeGreaterThanOrEqual(2);
    expect(room.join('c')).toBe('joined');
    expect(room.playerIds).toEqual(['c']);
  });

  test('last player leaving during playing returns to lobby', () => {
    const { room } = startMatch();
    room.leave('a');
    room.leave('b');
    expect(room.phaseKind).toBe('lobby');
  });

  test('ready spam and unknown ids are harmless', () => {
    const { room, transport, scheduler } = setup();
    room.join('a');
    room.markReady('ghost');
    room.queueInput('ghost', frame(1));
    room.leave('ghost');
    for (let i = 0; i < 5; i++) room.markReady('a');
    expect(room.phaseKind).toBe('lobby');
    room.join('b');
    room.markReady('b');
    room.markReady('b');
    room.markReady('a');
    expect(scheduler.starts).toBe(1);
    expect(transport.of('a', 'levelStarted')).toHaveLength(1);
    room.queueInput('ghost', frame(1));
    expect(() => room.tick()).not.toThrow();
  });

  test('duplicate join is refused and does not duplicate the player', () => {
    const { room } = setup();
    expect(room.join('a')).toBe('joined');
    expect(room.join('a')).toBe('refused');
    expect(room.playerIds).toEqual(['a']);
  });
});

describe('RoomManager', () => {
  test('returns the same default room', () => {
    const ids: string[] = [];
    const mgr = new RoomManager((id) => {
      ids.push(id);
      return new Room(id, new FakeTransport(), new FakeScheduler());
    });
    expect(mgr.defaultRoom()).toBe(mgr.defaultRoom());
    expect(mgr.defaultRoom().id).toBe('default');
    expect(ids).toEqual(['default']);
  });
});
