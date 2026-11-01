import { describe, expect, test } from 'vitest';
import {
  LEVELS,
  NEVER_SHOT_TICKS,
  STARTING_AMMO,
  getLevel,
  type InputFrame,
  type LevelStarted,
  type MatchEnded,
  type PlayerId,
  type RoomLobby,
  type ServerToClientEvents,
  type Snapshot,
  type WorldState,
} from '@bng/shared';
import { Room, type RoomTransport, type TickScheduler } from '../src/rooms/room.ts';
import { MAX_ROOMS, RoomManager, type RoomResult } from '../src/rooms/room-manager.ts';

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
  const closed: Room[] = [];
  const room = new Room({
    id: 'r',
    name: 'Sala',
    transport,
    scheduler,
    onClosed: (r) => closed.push(r),
  });
  return { room, transport, scheduler, closed };
}

function startMatch(ids: PlayerId[] = ['a', 'b']) {
  const ctx = setup();
  for (const id of ids) ctx.room.join(id, id);
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
    room.join('a', 'a');
    room.markReady('a');
    expect(room.phaseKind).toBe('lobby');
    room.join('b', 'b');
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
    room.join('a', 'a');
    room.join('b', 'b');
    room.markReady('a');
    room.leave('b');
    expect(room.phaseKind).toBe('lobby');
    expect(scheduler.starts).toBe(0);
  });

  test('leaving can start the match when the rest are all ready', () => {
    const { room } = setup();
    for (const id of ['a', 'b', 'c']) room.join(id, id);
    room.markReady('a');
    room.markReady('b');
    room.leave('c');
    expect(room.phaseKind).toBe('playing');
  });

  test('join refused while playing and once closed', () => {
    const { room } = startMatch();
    expect(room.join('c', 'c')).toBe('refused');
    expect(room.playerIds).toEqual(['a', 'b']);
    room.__setWorldForTest({ ...room.worldForTest()!, levelIndex: LEVELS.length - 1 });
    placeOnPortal(room, 'a');
    room.tick();
    expect(room.phaseKind).toBe('closed');
    expect(room.join('c', 'c')).toBe('refused');
    expect(room.playerIds).toEqual([]);
  });

  test('lobby changes are broadcast with nicknames and ready state', () => {
    const { room, transport } = setup();
    room.join('a', 'Ana');
    room.join('b', 'Beto');
    room.markReady('a');
    room.markReady('a');
    const lobbies = transport.of('a', 'lobbyUpdated').map((s) => s.args[0] as RoomLobby);
    expect(lobbies).toHaveLength(3);
    expect(lobbies.at(-1)).toEqual({
      id: 'r',
      name: 'Sala',
      players: [
        { id: 'a', nickname: 'Ana', ready: true },
        { id: 'b', nickname: 'Beto', ready: false },
      ],
    });
    room.leave('a');
    const last = transport.of('b', 'lobbyUpdated').at(-1)!.args[0] as RoomLobby;
    expect(last.players).toEqual([{ id: 'b', nickname: 'Beto', ready: false }]);
    expect(transport.of('a', 'lobbyUpdated')).toHaveLength(3);
  });

  test('summary reports players and status', () => {
    const { room } = setup();
    room.join('a', 'Ana');
    expect(room.summary()).toEqual({ id: 'r', name: 'Sala', players: 1, status: 'lobby' });
    room.join('b', 'Beto');
    room.markReady('a');
    room.markReady('b');
    expect(room.summary()).toEqual({ id: 'r', name: 'Sala', players: 2, status: 'playing' });
  });

  test('levelStarted carries every nickname', () => {
    const { room, transport } = setup();
    room.join('a', 'Ana');
    room.join('b', 'Beto');
    room.markReady('a');
    room.markReady('b');
    const started = transport.of('b', 'levelStarted')[0]!.args[0] as LevelStarted;
    expect(started.nicknames).toEqual({ a: 'Ana', b: 'Beto' });
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
    room.join('a', 'a');
    room.join('b', 'b');
    room.leave('a');
    room.join('a2', 'a2');
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
    room.join('a', 'a');
    room.join('b', 'b');
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

  test('last portal ends match: matchEnded completed, scheduler stopped, room closed', () => {
    const { room, transport, scheduler, closed } = startMatch();
    room.__setWorldForTest({ ...room.worldForTest()!, levelIndex: LEVELS.length - 1 });
    placeOnPortal(room, 'a');
    room.tick();
    expect(room.phaseKind).toBe('closed');
    expect(scheduler.stops).toBe(1);
    expect(closed).toEqual([room]);
    const payloads = ['a', 'b'].map((id) => {
      const ended = transport.of(id, 'matchEnded');
      expect(ended).toHaveLength(1);
      return ended[0]!.args[0] as MatchEnded;
    });
    // Standing on the portal may also pick up a coin on the same tick, so only a's score is open.
    expect(payloads[0]).toEqual(payloads[1]);
    expect(payloads[0]!.reason).toBe('completed');
    expect(payloads[0]!.scores.map((s) => s.id)).toEqual(['a', 'b']);
    expect(payloads[0]!.scores[1]!.score).toBe(0);
    room.tick();
    expect(transport.of('a', 'snapshot')).toHaveLength(0);
  });

  test('leave during playing with others left removes the player and keeps ticking', () => {
    const { room, transport, closed } = startMatch(['a', 'b', 'c']);
    room.leave('b');
    expect(room.phaseKind).toBe('playing');
    expect(room.playerIds).toEqual(['a', 'c']);
    expect(() => ticks(room, 3)).not.toThrow();
    const snap = transport.of('a', 'snapshot')[0]!.args[0] as Snapshot;
    expect(snap.players.map((p) => p.id)).toEqual(['a', 'c']);
    expect(transport.of('b', 'snapshot')).toHaveLength(0);
    expect(closed).toEqual([]);
  });

  test('a match left with one player ends with rivalsLeft and closes', () => {
    const { room, transport, scheduler, closed } = startMatch();
    room.leave('b');
    expect(room.phaseKind).toBe('closed');
    expect(scheduler.stops).toBe(1);
    expect(closed).toEqual([room]);
    expect(transport.of('b', 'matchEnded')).toHaveLength(0);
    const ended = transport.of('a', 'matchEnded');
    expect(ended).toHaveLength(1);
    const payload = ended[0]!.args[0] as MatchEnded;
    expect(payload.reason).toBe('rivalsLeft');
    expect(payload.scores.map((s) => s.id)).toEqual(['a']);
    // Closing is final: later calls change nothing.
    room.leave('a');
    room.markReady('a');
    expect(closed).toHaveLength(1);
  });

  test('a lobby closes once everyone leaves, but not while someone waits', () => {
    const { room, closed } = setup();
    room.join('a', 'a');
    room.join('b', 'b');
    room.leave('b');
    expect(room.phaseKind).toBe('lobby');
    expect(closed).toEqual([]);
    room.leave('a');
    expect(room.phaseKind).toBe('closed');
    expect(closed).toEqual([room]);
    expect(room.join('c', 'c')).toBe('refused');
  });

  test('ready spam and unknown ids are harmless', () => {
    const { room, transport, scheduler } = setup();
    room.join('a', 'a');
    room.markReady('ghost');
    room.queueInput('ghost', frame(1));
    room.leave('ghost');
    for (let i = 0; i < 5; i++) room.markReady('a');
    expect(room.phaseKind).toBe('lobby');
    room.join('b', 'b');
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
    expect(room.join('a', 'a')).toBe('joined');
    expect(room.join('a', 'a')).toBe('refused');
    expect(room.playerIds).toEqual(['a']);
  });
});

describe('RoomManager', () => {
  function manager() {
    const transport = new FakeTransport();
    const schedulers: FakeScheduler[] = [];
    let next = 0;
    const mgr = new RoomManager(
      ({ id, name, onClosed }) => {
        const scheduler = new FakeScheduler();
        schedulers.push(scheduler);
        return new Room({ id, name, transport, scheduler, onClosed });
      },
      () => `room-${++next}`,
    );
    return { mgr, transport, schedulers };
  }

  function lobbyOf(result: RoomResult): RoomLobby {
    if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
    return result.lobby;
  }

  test('create joins the creator and lists the room', () => {
    const { mgr } = manager();
    const lobby = lobbyOf(mgr.create('a', 'Sala de Ana', 'Ana'));
    expect(lobby).toEqual({
      id: 'room-1',
      name: 'Sala de Ana',
      players: [{ id: 'a', nickname: 'Ana', ready: false }],
    });
    expect(mgr.roomOf('a')?.id).toBe('room-1');
    expect(mgr.list()).toEqual([
      { id: 'room-1', name: 'Sala de Ana', players: 1, status: 'lobby' },
    ]);
  });

  test('join adds the player; errors for unknown rooms, a second room or a running match', () => {
    const { mgr } = manager();
    mgr.create('a', 'Uno', 'Ana');
    expect(mgr.join('b', 'nope', 'Beto')).toEqual({ ok: false, error: 'notFound' });
    expect(lobbyOf(mgr.join('b', 'room-1', 'Beto')).players.map((p) => p.nickname)).toEqual([
      'Ana',
      'Beto',
    ]);
    expect(mgr.join('b', 'room-1', 'Beto')).toEqual({ ok: false, error: 'alreadyInRoom' });
    expect(mgr.create('b', 'Dos', 'Beto')).toEqual({ ok: false, error: 'alreadyInRoom' });
    mgr.roomOf('a')!.markReady('a');
    mgr.roomOf('b')!.markReady('b');
    expect(mgr.join('c', 'room-1', 'Carla')).toEqual({ ok: false, error: 'inProgress' });
    expect(mgr.roomOf('c')).toBeUndefined();
    expect(mgr.list()[0]!.status).toBe('playing');
  });

  test('an emptied room is forgotten and its player can join another', () => {
    const { mgr } = manager();
    mgr.create('a', 'Uno', 'Ana');
    mgr.leave('a');
    expect(mgr.list()).toEqual([]);
    expect(mgr.roomOf('a')).toBeUndefined();
    expect(mgr.join('a', 'room-1', 'Ana')).toEqual({ ok: false, error: 'notFound' });
    expect(lobbyOf(mgr.create('a', 'Dos', 'Ana')).id).toBe('room-2');
  });

  test('a match ending forgets the room and frees the remaining player', () => {
    const { mgr, transport, schedulers } = manager();
    mgr.create('a', 'Uno', 'Ana');
    mgr.join('b', 'room-1', 'Beto');
    mgr.roomOf('a')!.markReady('a');
    mgr.roomOf('b')!.markReady('b');
    mgr.leave('b');
    expect(transport.of('a', 'matchEnded')).toHaveLength(1);
    expect(schedulers[0]!.stops).toBe(1);
    expect(mgr.list()).toEqual([]);
    expect(mgr.roomOf('a')).toBeUndefined();
    expect(lobbyOf(mgr.create('a', 'Dos', 'Ana')).id).toBe('room-2');
  });

  test('refuses to create more than MAX_ROOMS rooms', () => {
    const { mgr } = manager();
    for (let i = 0; i < MAX_ROOMS; i++) expect(mgr.create(`p${i}`, 'Sala', 'P').ok).toBe(true);
    expect(mgr.create('late', 'Sala', 'P')).toEqual({ ok: false, error: 'tooManyRooms' });
    expect(mgr.roomOf('late')).toBeUndefined();
  });

  test('leave for a player in no room is harmless', () => {
    const { mgr } = manager();
    expect(() => mgr.leave('ghost')).not.toThrow();
  });
});
